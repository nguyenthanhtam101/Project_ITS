import os
import uuid
import shutil
import json
import yt_dlp
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import pandas as pd
import threading
import time
import requests
import io
import hashlib
from typing import List, Dict, Any
import numpy as np
from sqlalchemy import text
from core.database import engine
from config import TOMTOM_API_KEY, HCM_HOTSPOTS
from core.ai_engine import load_models
from core.tracker_logic import generate_frames

app = FastAPI(title="ITS Backend Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=False,  
    allow_methods=["*"], 
    allow_headers=["*"],
)

os.makedirs("temp_videos", exist_ok=True)
app.mount("/evidence", StaticFiles(directory="evidence"), name="evidence")

ACTIVE_SESSIONS = {}
ACTIVE_STREAMS = {}
ACTIVE_STATS = {} 
TOMTOM_CACHE = []

print("Đang nạp AI Models vào bộ nhớ...")
try:
    model, reader, AI_DEVICE = load_models()
    print(f"✅ Nạp AI Models thành công! Đang chạy trên: {AI_DEVICE}")
except Exception as e:
    print(f"⚠️ Lỗi nạp mô hình: {e}")
    model, reader, AI_DEVICE = None, None, 'cpu'

# ==============================================================
# HỆ THỐNG API UPLOAD & STREAM VIDEO CHÍNH
# ==============================================================

@app.post("/api/upload-video")
def upload_video(file: UploadFile = File(...), settings: str = Form(...)):
    video_id = f"{uuid.uuid4()}.mp4"
    file_path = f"temp_videos/{video_id}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    ACTIVE_SESSIONS[video_id] = json.loads(settings)
    ACTIVE_STREAMS[video_id] = file_path
    ACTIVE_STATS[video_id] = {"total": 0, "violations": 0} 
    return {"video_id": video_id}

@app.post("/api/upload-youtube")
def upload_youtube(url: str = Form(...), settings: str = Form(...)):
    ydl_opts = {'format': 'best[ext=mp4]/best', 'quiet': True, 'no_warnings': True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            stream_url = info.get('url') or info.get('manifest_url')
            if not stream_url:
                return {"error": "Không thể trích xuất luồng từ Video này!"}
    except Exception as e: 
        return {"error": f"Lỗi trích xuất YouTube: {str(e)}"}
        
    video_id = f"yt_{uuid.uuid4().hex}"
    ACTIVE_SESSIONS[video_id] = json.loads(settings)
    ACTIVE_STREAMS[video_id] = stream_url
    ACTIVE_STATS[video_id] = {"total": 0, "violations": 0} 
    return {"video_id": video_id}

@app.get("/api/cctv-list")
def get_cctv_list():
    if engine is None: return []
    try:
        with engine.connect() as conn:
            # ĐÃ SỬA: Dùng SELECT * để lấy cả lat, lon, status, country
            df = pd.read_sql("SELECT * FROM cameras WHERE stream_url IS NOT NULL", conn)
        return df.to_dict('records')
    except Exception as e:
        print("Lỗi lấy danh sách CCTV:", e)
        return []

@app.post("/api/upload-cctv")
def upload_cctv(camera_name: str = Form(...), settings: str = Form(...)):
    if engine is None: 
        return {"error": "Lỗi kết nối Database!"}
    
    try:
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT stream_url FROM cameras WHERE name=:n"), 
                {"n": camera_name}
            ).fetchone()
            
        if not result or not result[0]:
            return {"error": f"Trạm camera '{camera_name}' chưa được cấu hình đường dẫn stream_url trong Database!"}
            
        stream_url = result[0]
    except Exception as e:
        return {"error": f"Lỗi truy vấn cơ sở dữ liệu: {str(e)}"}
        
    video_id = f"cctv_{uuid.uuid4().hex}"
    ACTIVE_SESSIONS[video_id] = json.loads(settings)
    ACTIVE_STREAMS[video_id] = stream_url
    ACTIVE_STATS[video_id] = {"total": 0, "violations": 0} 
    
    return {"video_id": video_id}

@app.post("/api/update-settings/{video_id}")
async def update_settings(video_id: str, settings: str = Form(...)):
    if video_id in ACTIVE_SESSIONS:
        ACTIVE_SESSIONS[video_id] = json.loads(settings)
        return {"status": "success"}
    return {"error": "Session not found"}

@app.get("/api/stats/{video_id}")
def get_stats(video_id: str):
    return ACTIVE_STATS.get(video_id, {"total": "--", "violations": "--"})

@app.get("/api/stream-video/{video_id}")
def stream_video(video_id: str):
    video_path = ACTIVE_STREAMS.get(video_id)
    if not video_path: return {"error": "Stream not found"}
    
    return StreamingResponse(
        generate_frames(video_path, video_id, ACTIVE_SESSIONS, ACTIVE_STATS, model, reader, AI_DEVICE), 
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

# ==============================================================
# HỆ THỐNG ĐĂNG NHẬP / ĐĂNG KÝ (AUTHENTICATION)
# ==============================================================

class UserAuth(BaseModel):
    username: str
    password: str
    full_name: str = ""

@app.post("/api/register")
def register_user(user: UserAuth):
    if engine is None:
        return {"status": "error", "message": "Lỗi Server: Chưa kết nối được Database PostgreSQL!"}
        
    try:
        pwd_hash = hashlib.sha256(user.password.encode()).hexdigest()
        with engine.begin() as conn:
            check = conn.execute(text("SELECT id FROM users WHERE username=:u"), {"u": user.username}).fetchone()
            if check:
                return {"status": "error", "message": "Tên đăng nhập đã tồn tại!"}
            
            conn.execute(text(
                "INSERT INTO users (username, password_hash, full_name) VALUES (:u, :p, :f)"
            ), {"u": user.username, "p": pwd_hash, "f": user.full_name})
        return {"status": "success", "message": "Đăng ký thành công! Vui lòng đăng nhập."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/login")
def login_user(user: UserAuth):
    if engine is None:
        return {"status": "error", "message": "Lỗi Server: Chưa kết nối được Database PostgreSQL!"}

    try:
        pwd_hash = hashlib.sha256(user.password.encode()).hexdigest()
        with engine.connect() as conn:
            result = conn.execute(text(
                "SELECT full_name FROM users WHERE username=:u AND password_hash=:p"
            ), {"u": user.username, "p": pwd_hash}).fetchone()
            
            if result:
                return {"status": "success", "full_name": result[0]}
            else:
                return {"status": "error", "message": "Sai tài khoản hoặc mật khẩu!"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# ==============================================================
# LOGIC TOMTOM LIVE MAP 
# ==============================================================

def update_tomtom_data():
    global TOMTOM_CACHE
    while True:
        data_records = []
        for name, coords in HCM_HOTSPOTS.items():
            url = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key={TOMTOM_API_KEY}&point={coords}"
            try:
                res = requests.get(url, timeout=5)
                if res.status_code == 200:
                    flow = res.json().get('flowSegmentData', {})
                    curr_speed = flow.get('currentSpeed', 0)
                    free_speed = flow.get('freeFlowSpeed', 1)
                    cong_pct = round((1 - (curr_speed / free_speed)) * 100, 1)
                    cong_pct = max(0, min(100, cong_pct))
                    
                    if cong_pct > 60: status = "Kẹt Cứng"
                    elif cong_pct > 30: status = "Ùn Ứ"
                    else: status = "Thông Thoáng"
                    
                    district = name.split('(')[-1].replace(')', '').strip()
                    node_name = name.split('(')[0].strip()
                    lat, lon = map(float, coords.split(','))
                    
                    data_records.append({
                        "district": district, "node_name": node_name,
                        "lat": lat, "lon": lon,
                        "curr_speed": curr_speed, "free_speed": free_speed,
                        "cong_pct": cong_pct, "status": status
                    })
            except Exception: pass
            time.sleep(0.5) 
        
        if data_records: TOMTOM_CACHE = data_records
        time.sleep(30) 

threading.Thread(target=update_tomtom_data, daemon=True).start()

@app.get("/api/tomtom")
def get_tomtom_traffic():
    return TOMTOM_CACHE

# ==============================================================
# TAB 3: LOGIC PHÂN TÍCH DATABASE SQL & XUẤT BÁO CÁO
# ==============================================================

class AnalyticsFilter(BaseModel):
    start_date: str
    end_date: str
    camera: str

@app.get("/api/cameras")
def get_cameras():
    try:
        df = pd.read_sql("SELECT DISTINCT name FROM cameras", engine)
        return ["Tất cả các trạm"] + df['name'].tolist()
    except:
        return ["Tất cả các trạm"]

@app.post("/api/analytics")
def get_analytics_data(filters: AnalyticsFilter):
    try:
        cam_filter = "" if filters.camera == "Tất cả các trạm" else f"AND camera_name = '{filters.camera}'"
        query = f"""
            SELECT 
                timestamp AS "Thời Gian", vehicle_id AS "ID Xe", vehicle_type AS "Loại Phương Tiện", 
                speed AS "Tốc Độ (km/h)", plate_text AS "Biển Số", status AS "Trạng Thái", camera_name AS "Camera"
            FROM traffic_events
            WHERE timestamp::date >= '{filters.start_date}' AND timestamp::date <= '{filters.end_date}'
            {cam_filter} ORDER BY timestamp ASC
        """
        df = pd.read_sql(query, engine)
        
        if df.empty:
            return {"status": "empty", "data": [], "kpi": {}}

        df['Thời Gian'] = pd.to_datetime(df['Thời Gian'])
        df['Tốc Độ (km/h)'] = pd.to_numeric(df['Tốc Độ (km/h)'], errors='coerce').fillna(0)
        df['Thời Gian_str'] = df['Thời Gian'].dt.strftime('%Y-%m-%d %H:%M:%S')
        df['Giờ_Phút'] = df['Thời Gian'].dt.strftime('%H:%M')
        
        violations = df[~df['Trạng Thái'].isin(['Bình Thường', 'Normal', 'Low', 'Thông Thoáng', 'Lưu thông Tự do'])]
        
        kpi = {
            "total_vehicles": len(df['ID Xe'].unique()),
            "total_violations": len(violations),
            "avg_speed": round(df[df['Tốc Độ (km/h)'] > 0]['Tốc Độ (km/h)'].mean(), 1) if (df['Tốc Độ (km/h)'] > 0).any() else 0
        }

        trend_data = df.groupby('Giờ_Phút').size().reset_index(name='Số Xe').to_dict('records')
        type_data = df['Loại Phương Tiện'].value_counts().reset_index().rename(columns={'count': 'Số Lượng', 'Loại Phương Tiện': 'Loại Xe'}).to_dict('records')
        viol_type_data = violations['Trạng Thái'].value_counts().reset_index().rename(columns={'count': 'Số Lượng', 'Trạng Thái': 'Loại Lỗi'}).to_dict('records')
        
        evidence_list = violations[['Thời Gian_str', 'Trạng Thái', 'Loại Phương Tiện', 'Biển Số', 'ID Xe', 'Tốc Độ (km/h)', 'Camera']].to_dict('records')
        raw_data = df[['Thời Gian_str', 'ID Xe', 'Loại Phương Tiện', 'Tốc Độ (km/h)', 'Biển Số', 'Trạng Thái', 'Camera']].to_dict('records')

        return {
            "status": "success", "kpi": kpi, "trend_data": trend_data, "type_data": type_data,
            "viol_type_data": viol_type_data, "evidence_list": evidence_list, "raw_data": raw_data
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/analytics/export/excel")
def export_excel(filters: AnalyticsFilter):
    try:
        cam_filter = "" if filters.camera == "Tất cả các trạm" else f"AND camera_name = '{filters.camera}'"
        query = f"""
            SELECT 
                timestamp AS "Thời Gian", vehicle_id AS "ID Xe", vehicle_type AS "Loại Phương Tiện", 
                speed AS "Tốc Độ (km/h)", plate_text AS "Biển Số", status AS "Trạng Thái", camera_name AS "Camera"
            FROM traffic_events
            WHERE timestamp::date >= '{filters.start_date}' AND timestamp::date <= '{filters.end_date}'
            {cam_filter} ORDER BY timestamp ASC
        """
        df = pd.read_sql(query, engine)
        
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
            df_export = df.copy()
            if not df_export.empty:
                df_export['Thời Gian'] = pd.to_datetime(df_export['Thời Gian']).dt.tz_localize(None)
            df_export.to_excel(writer, sheet_name='Su_Kien_Giao_Thong', index=False)
            
            violations = df_export[~df_export['Trạng Thái'].isin(['Bình Thường', 'Normal', 'Low', 'Thông Thoáng', 'Lưu thông Tự do'])]
            violations.to_excel(writer, sheet_name='Danh_Sach_Vi_Pham', index=False)
            
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=Bao_Cao_ITS_{filters.start_date}_den_{filters.end_date}.xlsx"}
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/analytics/export/csv")
def export_csv(filters: AnalyticsFilter):
    try:
        cam_filter = "" if filters.camera == "Tất cả các trạm" else f"AND camera_name = '{filters.camera}'"
        query = f"""
            SELECT 
                timestamp AS "Thời Gian", vehicle_id AS "ID Xe", vehicle_type AS "Loại Phương Tiện", 
                speed AS "Tốc Độ (km/h)", plate_text AS "Biển Số", status AS "Trạng Thái", camera_name AS "Camera"
            FROM traffic_events
            WHERE timestamp::date >= '{filters.start_date}' AND timestamp::date <= '{filters.end_date}'
            {cam_filter} ORDER BY timestamp ASC
        """
        df = pd.read_sql(query, engine)
        csv_data = df.to_csv(index=False, encoding='utf-8-sig')
        
        return StreamingResponse(
            io.BytesIO(csv_data.encode('utf-8-sig')),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=Raw_Data_{filters.start_date}_den_{filters.end_date}.csv"}
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}

# ==============================================================
# ADMIN DASHBOARD API
# ==============================================================

@app.get("/api/admin/users")
def get_all_users():
    if engine is None: return []
    try:
        with engine.connect() as conn:
            df = pd.read_sql("SELECT id, username, full_name, created_at FROM users", conn)
        df['created_at'] = df['created_at'].astype(str)
        return df.to_dict('records')
    except: return []

@app.delete("/api/admin/users/{username}")
def delete_user_by_username(username: str):
    if engine is None: return {"status": "error"}
    if username == 'admin': return {"status": "error", "message": "Không thể xóa Super Admin!"}
    try:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM users WHERE username=:u"), {"u": username})
        return {"status": "success"}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.get("/api/admin/table/{table_name}")
def get_table(table_name: str):
    if engine is None: return []
    allowed_tables = ['cameras', 'traffic_events', 'tomtom_intersections']
    if table_name not in allowed_tables: return []
    try:
        # Sửa lỗi ORDER BY id cho bảng không có id
        order_clause = "ORDER BY timestamp DESC LIMIT 500" if table_name == 'traffic_events' else "ORDER BY id ASC" if table_name == 'cameras' else ""
        with engine.connect() as conn:
            df = pd.read_sql(f"SELECT * FROM {table_name} {order_clause}", conn)
            
        if 'timestamp' in df.columns:
            df['timestamp'] = df['timestamp'].astype(str)
            
        # Fix dứt điểm lỗi màn hình rỗng NaN của JSON
        import numpy as np
        df = df.replace([np.nan, np.inf, -np.inf], "")
        
        return df.to_dict('records')
    except: return []

@app.post("/api/admin/table/{table_name}/sync")
def sync_table(table_name: str, data: List[Dict[str, Any]]):
    if engine is None: return {"status": "error"}
    allowed_tables = ['cameras', 'traffic_events', 'tomtom_intersections']
    if table_name not in allowed_tables: return {"status": "error"}
    try:
        for row in data:
            for key, val in row.items():
                # Nếu giá trị là chuỗi rỗng hoặc chỉ có khoảng trắng
                if isinstance(val, str) and val.strip() == "":
                    row[key] = None

        df = pd.DataFrame(data)
        
        # BẢO VỆ DATABASE: Xóa dòng bằng TRUNCATE để giữ nguyên thuộc tính tự động nhảy ID
        with engine.begin() as conn:
            conn.execute(text(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE;"))
            
        # Đẩy dữ liệu vào lại bảng
        if not df.empty:
            df.to_sql(table_name, engine, if_exists="append", index=False)
            
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
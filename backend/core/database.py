import os
from sqlalchemy import create_engine, text
from datetime import datetime
import hashlib

# ==========================================
# 1. CẤU HÌNH KẾT NỐI POSTGRESQL TRÊN DOCKER
# ==========================================
# DB_USER = "admin_its"      # Tên user trong Docker
# DB_PASS = "SecretPassword123"        # Mật khẩu trong Docker
# DB_HOST = "localhost"     # Chạy trên máy cá nhân
# DB_PORT = "5432"          # Cổng Docker đã map ra ngoài
# DB_NAME = "its_hcm_db"       # Tên Database trong Docker

# DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}" docker localhost
# DATABASE_URL = "postgresql://postgres:ThanhTamITS2026@db.sytvneuehabkuodbxvto.supabase.co:5432/postgres" ipv6
DATABASE_URL = "postgresql://postgres.sytvneuehabkuodbxvto:ThanhTamITS2026@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"  #ipv4
try:
    engine = create_engine(DATABASE_URL)
    print("Đã kết nối thành công tới Database PostgreSQL trên Supabase Cloud!")
    
    # ---------------------------------------------------------
    # GIAO DỊCH 1: Tạo các bảng cơ sở (Khối này an toàn 100%)
    # ---------------------------------------------------------
    with engine.begin() as conn:
        # TẠO BẢNG USERS
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))
        
        # Tạo tài khoản Admin mặc định
        admin_pwd = hashlib.sha256("admin123".encode()).hexdigest()
        conn.execute(text(f"""
            INSERT INTO users (username, password_hash, full_name) 
            VALUES ('admin', '{admin_pwd}', 'Super Admin') 
            ON CONFLICT DO NOTHING;
        """))

        # TẠO BẢNG TRAFFIC EVENTS
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS traffic_events (
                id SERIAL PRIMARY KEY, timestamp TIMESTAMP NOT NULL, vehicle_id INTEGER,
                vehicle_type VARCHAR(50), speed INTEGER, plate_text VARCHAR(20),
                status VARCHAR(100), camera_name VARCHAR(100)
            );
        """))
        
        # TẠO BẢNG CAMERAS (Bản gốc)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS cameras (
                id SERIAL PRIMARY KEY, 
                name VARCHAR(100) UNIQUE NOT NULL
            );
        """))
        
        # TẠO BẢNG TOMTOM
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS tomtom_intersections (
                name VARCHAR(255) PRIMARY KEY, lat FLOAT, lon FLOAT
            );
        """))

    # ----------------------------
    # GIAO DỊCH 2: Nâng cấp bảng (Thêm tọa độ, quốc gia, trạng thái)
    # ----------------------------
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE cameras ADD COLUMN stream_url TEXT;"))
    except Exception: pass 
    
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE cameras ADD COLUMN lat FLOAT;"))
            conn.execute(text("ALTER TABLE cameras ADD COLUMN lon FLOAT;"))
            conn.execute(text("ALTER TABLE cameras ADD COLUMN country VARCHAR(100);"))
            conn.execute(text("ALTER TABLE cameras ADD COLUMN status VARCHAR(50) DEFAULT 'Active';"))
    except Exception: pass

    # ---------------------------------------------------------
    # GIAO DỊCH 3: Bơm dữ liệu CCTV Demo 
    # ---------------------------------------------------------
    try:
        with engine.begin() as conn:
            cam_name = 'Sussex, Delaware, United States'
            cam_url = 'https://opencctv.org/api/hls/arcgis-DE-333?t=1781439689&s=1wbgilr'
            
            # 1. Kiểm tra xem camera đã tồn tại chưa
            check = conn.execute(text("SELECT id FROM cameras WHERE name=:n"), {"n": cam_name}).fetchone()
            
            if check:
                # 2a. Nếu đã có, thì Cập nhật Link mới
                conn.execute(text("UPDATE cameras SET stream_url=:url WHERE name=:n"), {"url": cam_url, "n": cam_name})
            else:
                # 2b. Nếu chưa có, thì Thêm mới hoàn toàn
                conn.execute(text("INSERT INTO cameras (name, stream_url) VALUES (:n, :url)"), {"n": cam_name, "url": cam_url})
    except Exception as e:
        print("Bỏ qua việc bơm Camera mẫu (Lỗi nhẹ):", e)

    print("✅ Đã khởi tạo toàn bộ cấu trúc bảng SQL thành công!")
    
except Exception as e:
    print(f"❌ Lỗi kết nối Database: {e}")
    engine = None

def save_event_to_db(vehicle_id, v_class, speed, plate_text, status, camera_name="Camera 1"):
    if engine is None: return
    try:
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        insert_query = """
            INSERT INTO traffic_events (timestamp, vehicle_id, vehicle_type, speed, plate_text, status, camera_name)
            VALUES (:timestamp, :vehicle_id, :vehicle_type, :speed, :plate_text, :status, :camera_name)
        """
        with engine.begin() as conn:
            conn.execute(text(insert_query), {
                "timestamp": timestamp, "vehicle_id": vehicle_id, "vehicle_type": v_class,
                "speed": speed, "plate_text": plate_text, "status": status, "camera_name": camera_name
            })
    except Exception as e:
        print(f"⚠️ Lỗi khi ghi vào Database: {e}")

# ==========================================
# ĐỒNG BỘ DỮ LIỆU TOMTOM TỪ CONFIG VÀO DATABASE
# ==========================================
try:
    from config import TOMTOM_HOTSPOTS 
    
    with engine.begin() as conn:
        # Kiểm tra xem bảng tomtom đã có dữ liệu chưa
        count = conn.execute(text("SELECT COUNT(*) FROM tomtom_intersections")).scalar()
        
        # Nếu bảng trống (count == 0), tiến hành bơm dữ liệu từ config vào
        if count == 0:
            print("⏳ Đang đồng bộ danh sách TomTom từ config.py lên Supabase...")
            for name, coords in TOMTOM_HOTSPOTS.items():
                lat, lon = map(float, coords.split(','))
                conn.execute(text("""
                    INSERT INTO tomtom_intersections (name, lat, lon) 
                    VALUES (:name, :lat, :lon)
                """), {"name": name, "lat": lat, "lon": lon})
            print("✅ Đã bơm xong 15 nút giao TomTom vào Database!")
        else:
            print("✅ Dữ liệu TomTom đã tồn tại trên Supabase, bỏ qua bước đồng bộ.")
            
except Exception as e:
    print(f"⚠️ Bỏ qua đồng bộ TomTom (Lỗi: {e})")
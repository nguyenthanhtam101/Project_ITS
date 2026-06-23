import cv2
import numpy as np
import os
import csv
import time
import re
import math  # BỔ SUNG: Import thư viện toán học để tính góc
from datetime import datetime
from collections import defaultdict
from config import *
from core.ai_engine import correct_vietnamese_plate
from core.telegram_bot import trigger_telegram
from core.database import save_event_to_db

def order_points(pts):
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect

# ==============================================================
# HÀM LOGIC TOÁN HỌC: TÍNH GÓC VECTOR (ĐƯA THẲNG VÀO ĐÂY ĐỂ TRÁNH LỖI)
# ==============================================================
def calculate_angle(v_vehicle, v_allowed):
    if not v_allowed or not v_vehicle:
        return 0
    if (v_allowed[0] == 0 and v_allowed[1] == 0) or (v_vehicle[0] == 0 and v_vehicle[1] == 0):
        return 0
    dot_product = v_vehicle[0] * v_allowed[0] + v_vehicle[1] * v_allowed[1]
    mag_vehicle = math.sqrt(v_vehicle[0]**2 + v_vehicle[1]**2)
    mag_allowed = math.sqrt(v_allowed[0]**2 + v_allowed[1]**2)
    cos_theta = dot_product / (mag_vehicle * mag_allowed)
    cos_theta = max(-1.0, min(1.0, cos_theta))
    return math.degrees(math.acos(cos_theta))

def get_traffic_light_state(frame, roi):
    if roi == (0, 0, 0, 0): return 'UNKNOWN'
    crop = frame[roi[1]:roi[1] + roi[3], roi[0]:roi[0] + roi[2]]
    if crop.size == 0: return 'UNKNOWN'
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mask_red = cv2.inRange(hsv, np.array([0, 40, 100]), np.array([7, 255, 255])) | cv2.inRange(hsv, np.array([170, 40, 100]), np.array([180, 255, 255]))
    mask_yellow = cv2.inRange(hsv, np.array([10, 40, 100]), np.array([35, 255, 255]))
    mask_green = cv2.inRange(hsv, np.array([40, 40, 100]), np.array([90, 255, 255]))
    r_c, y_c, g_c = cv2.countNonZero(mask_red), cv2.countNonZero(mask_yellow), cv2.countNonZero(mask_green)
    max_c = max(r_c, y_c, g_c)
    return 'YELLOW' if max_c == y_c and max_c > 15 else ('RED' if max_c == r_c and max_c > 15 else ('GREEN' if max_c == g_c and max_c > 15 else 'UNKNOWN'))

def generate_frames(tfile_path, video_id, active_sessions, active_stats, model, reader, AI_DEVICE):
    save_dir = "saved_plates"
    os.makedirs(save_dir, exist_ok=True)
    os.makedirs("evidence", exist_ok=True)
    
    cap = cv2.VideoCapture(tfile_path)
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    DISPLAY_W = 1280
    DISPLAY_H = int(orig_h * (1280 / orig_w)) if orig_w > 0 else 720
    
    M_matrix, speed_polygon, rl_monitor_polygon, ww_polygon, ww_vector, heatmap_polygon = None, None, None, None, None, None
    rl_light_straight_roi = (0, 0, 0, 0)
    
    last_rois = None 

    plate_buffer, vehicle_tracking_data = {}, {}
    total_vehicles_counted, total_violations = 0, 0
    heatmap_matrix = np.zeros((DISPLAY_H, DISPLAY_W), dtype=np.float32)
    jam_start_time, jam_alert_sent = None, False

    video_fps = cap.get(cv2.CAP_PROP_FPS)
    if not video_fps or np.isnan(video_fps): video_fps = 30.0
    frame_count = 0
    PLATE_CONFIRM_TIMEOUT = 3.0

    try:
        while cap.isOpened():
            settings = active_sessions.get(video_id, {})
            run_speed = settings.get("runSpeed", False)
            run_redlight = settings.get("runRedlight", False)
            run_wrongway = settings.get("runWrongway", False)
            run_heatmap = settings.get("showHeatmap", False)
            speed_limit_live = settings.get("speedLimit", 55)
            jam_threshold = settings.get("jamThreshold", 15)
            allow_moto_right = settings.get("allowMotorbikeRightTurn", True)
            allow_car_right = settings.get("allowCarRightTurn", False)
            
            rois = settings.get("rois", {"speed": [], "wrongway": [], "redlight": [], "heatmap": [], "trafficLight": []})

            # ĐÃ FIX: ĐƯA VIỆC ĐỌC VECTOR RA NGOÀI ĐỂ NÓ CẬP NHẬT LIÊN TỤC THEO THỜI GIAN THỰC
            ww_vec_arr = settings.get("wrongwayVector")
            if ww_vec_arr is not None:
                ww_vector = (ww_vec_arr[0] * DISPLAY_W, ww_vec_arr[1] * DISPLAY_H)
            else:
                ww_vector = None
            
            if rois != last_rois:
                last_rois = rois.copy()
                
                speed_pts = rois.get("speed", [])
                if len(speed_pts) == 4:
                    pts = [[int(pt['x'] * DISPLAY_W), int(pt['y'] * DISPLAY_H)] for pt in speed_pts]
                    src_pts = order_points(np.array(pts, dtype="float32"))
                    speed_polygon = np.array(src_pts, np.int32)
                    REAL_W = globals().get('REAL_WIDTH_M', 3.5)
                    REAL_H = globals().get('REAL_HEIGHT_M', 15.0)
                    dst_w, dst_h = int(REAL_W * 100), int(REAL_H * 100)
                    M_matrix = cv2.getPerspectiveTransform(src_pts, np.array([[0, 0], [dst_w - 1, 0], [dst_w - 1, dst_h - 1], [0, dst_h - 1]], dtype="float32"))
                else:
                    M_matrix, speed_polygon = None, None

                ww_pts = rois.get("wrongway", [])
                if len(ww_pts) == 4:
                    pts = [[int(pt['x'] * DISPLAY_W), int(pt['y'] * DISPLAY_H)] for pt in ww_pts]
                    src_pts = order_points(np.array(pts, dtype="float32"))
                    ww_polygon = np.array(src_pts, np.int32)
                else:
                    ww_polygon = None

                rl_pts = rois.get("redlight", [])
                if len(rl_pts) == 4:
                    pts = [[int(pt['x'] * DISPLAY_W), int(pt['y'] * DISPLAY_H)] for pt in rl_pts]
                    src_pts = order_points(np.array(pts, dtype="float32"))
                    rl_monitor_polygon = np.array(src_pts, np.int32)
                else:
                    rl_monitor_polygon = None

                tl_pts = rois.get("trafficLight", [])
                if len(tl_pts) == 4:
                    pts = [[int(pt['x'] * DISPLAY_W), int(pt['y'] * DISPLAY_H)] for pt in tl_pts]
                    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
                    rl_light_straight_roi = (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))
                else:
                    rl_light_straight_roi = (0, 0, 0, 0)

                hm_pts = rois.get("heatmap", [])
                if len(hm_pts) == 4:
                    pts = [[int(pt['x'] * DISPLAY_W), int(pt['y'] * DISPLAY_H)] for pt in hm_pts]
                    src_pts = order_points(np.array(pts, dtype="float32"))
                    heatmap_polygon = np.array(src_pts, np.int32)
                else:
                    heatmap_polygon = None

            success, frame = cap.read()
            if not success: break
            
            frame_count += 1
            video_current_time = frame_count / video_fps
            frame = cv2.resize(frame, (DISPLAY_W, DISPLAY_H))
            clean_frame = frame.copy()
            
            cur_light_s = get_traffic_light_state(clean_frame, rl_light_straight_roi) if run_redlight else 'UNKNOWN'
            
            results = model.track(clean_frame, persist=True, tracker="bytetrack.yaml", conf=0.3, imgsz=1024, device=AI_DEVICE, verbose=False)
            boxes = results[0].boxes
            current_frame_ids = set()
            jam_count = 0
            temp_heat = np.zeros((DISPLAY_H, DISPLAY_W), dtype=np.float32)

            if boxes is not None and boxes.id is not None:
                for box in boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    class_name = model.names[int(box.cls[0])]
                    track_id = int(box.id[0]) if box.id is not None else -1
                    if track_id != -1: current_frame_ids.add(track_id)
                    center_x, bottom_y = int((x1 + x2) / 2), int(y2)

                    if class_name in ['car', 'motorcycle', 'truck', 'bus']:
                        if track_id not in vehicle_tracking_data:
                            vehicle_tracking_data[track_id] = {
                                'history': [], 'speed': 0, 'v_class': class_name,
                                'plate_text': "Không rõ", 'tele_sent': False, 'pending_tele': False,
                                'max_area': 0, 'best_frame': None, 'best_crop': None, 'violation_speed': 0,
                                'rl_state': 'WAITING', 'entry_x': 0, 'entry_light_s': 'UNKNOWN', 'is_redlight_err': False, 'alert_msg': "",
                                'ww_state': 'WAITING', 'ww_start_pt': (0, 0), 'is_wrongway_err': False,
                                'pending_tele_time': None, 'needs_best_frame': False
                            }
                            total_vehicles_counted += 1 

                        data = vehicle_tracking_data[track_id]
                        
                        if run_heatmap:
                            if heatmap_polygon is not None and cv2.pointPolygonTest(heatmap_polygon, (center_x, bottom_y), False) >= 0: jam_count += 1
                            elif heatmap_polygon is None: jam_count += 1 
                            veh_width = x2 - x1
                            heat_thickness = max(10, int(veh_width * 0.8))
                            if 'prev_center' in data:
                                px, py = data['prev_center']
                                cv2.line(temp_heat, (px, py), (center_x, bottom_y), 5.0, thickness=heat_thickness)
                            else: cv2.circle(temp_heat, (center_x, bottom_y), heat_thickness // 2, 5.0, -1)
                            data['prev_center'] = (center_x, bottom_y)

                        if (x2 - x1) * (y2 - y1) > data['max_area']:
                            data['max_area'] = (x2 - x1) * (y2 - y1)
                            data['best_crop'] = clean_frame[max(0, y1):min(DISPLAY_H, y2), max(0, x1):min(DISPLAY_W, x2)].copy()

                        if run_speed and speed_polygon is not None and not data['tele_sent'] and not data['is_redlight_err'] and not data['is_wrongway_err']:
                            if cv2.pointPolygonTest(speed_polygon, (center_x, bottom_y), False) >= 0:
                                cv2.circle(frame, (center_x, bottom_y), 4, (0, 255, 255), -1) 
                                pt = np.array([[[center_x, bottom_y]]], dtype="float32")
                                bev = cv2.perspectiveTransform(pt, M_matrix)[0][0]
                                data['history'].append((video_current_time, bev[0], bev[1]))
                                
                                if len(data['history']) >= 3:
                                    t1, x1b, y1b = data['history'][0]
                                    t2, x2b, y2b = data['history'][-1]
                                    dt = t2 - t1
                                    d_m = np.sqrt((x2b - x1b) ** 2 + (y2b - y1b) ** 2) / 100
                                    
                                    if dt > 0 and d_m > 1.5: 
                                        curr_spd = (d_m / dt) * 3.6
                                        data['speed'] = curr_spd if data['speed'] == 0 else data['speed'] * 0.7 + curr_spd * 0.3
                                        
                                        if int(data['speed']) > speed_limit_live and not data['pending_tele']:
                                            data['pending_tele'] = True
                                            data['pending_tele_time'] = video_current_time
                                            data['violation_speed'] = int(data['speed'])
                                            data['best_frame'] = frame.copy() 
                                            total_violations += 1

                        if run_wrongway and not data['tele_sent'] and not data['is_wrongway_err'] and ww_polygon is not None and ww_vector is not None:
                            if cv2.pointPolygonTest(ww_polygon, (center_x, bottom_y), False) >= 0:
                                if data['ww_state'] == 'WAITING': 
                                    data['ww_state'], data['ww_start_pt'] = 'TRACKING', (center_x, bottom_y)
                                elif data['ww_state'] == 'TRACKING':
                                    sx, sy = data['ww_start_pt']
                                    if np.sqrt((center_x - sx) ** 2 + (bottom_y - sy) ** 2) > 60:
                                        v_car = (center_x - sx, bottom_y - sy)
                                        
                                        angle_diff = calculate_angle(v_car, ww_vector)
                                        
                                        if angle_diff > 100: 
                                            data['pending_tele'], data['is_wrongway_err'] = True, True
                                            data['pending_tele_time'], data['ww_state'] = video_current_time, 'DONE'
                                            data['best_frame'] = frame.copy() 
                                            total_violations += 1
                                        else: 
                                            data['ww_start_pt'] = (center_x, bottom_y)
                            else:
                                if data['ww_state'] == 'TRACKING': data['ww_state'] = 'DONE'

                        if run_redlight and not data['tele_sent'] and not data['is_wrongway_err'] and rl_monitor_polygon is not None:
                            in_monitor = cv2.pointPolygonTest(rl_monitor_polygon, (center_x, bottom_y), False) >= 0
                            b_edge_y = max(rl_monitor_polygon[2][1], rl_monitor_polygon[3][1])
                            VECTOR_TURN_THRESHOLD = globals().get('VECTOR_TURN_THRESHOLD', 50)
                            if in_monitor and data['rl_state'] == 'WAITING':
                                data['rl_state'], data['entry_x'] = 'IN_ZONE', center_x
                                data['entry_light_s'] = cur_light_s if abs(bottom_y - b_edge_y) < 100 else 'SAFE'
                            elif data['rl_state'] == 'IN_ZONE' and not in_monitor:
                                data['rl_state'] = 'DONE'
                                if bottom_y < b_edge_y - 50:
                                    dx = center_x - data['entry_x']
                                    direction = 'LEFT' if dx < -VECTOR_TURN_THRESHOLD else ('RIGHT' if dx > VECTOR_TURN_THRESHOLD else 'STRAIGHT')
                                    v, msg = False, ""
                                    if data['entry_light_s'] == 'RED':
                                        if direction == 'STRAIGHT': v, msg = True, "Đi thẳng lúc Đèn Đỏ"
                                        elif direction == 'LEFT': v, msg = True, "Rẽ trái lúc Đèn Đỏ"
                                        elif direction == 'RIGHT' and not ((class_name == 'motorcycle' and allow_moto_right) or (class_name == 'car' and allow_car_right)): v, msg = True, "Rẽ phải lúc Đèn Đỏ"
                                    if v:
                                        data['pending_tele'], data['is_redlight_err'] = True, True
                                        data['pending_tele_time'], data['alert_msg'] = video_current_time, msg
                                        data['best_frame'] = frame.copy() 
                                        total_violations += 1

            if run_heatmap:
                if frame_count % int(video_fps) == 0: 
                    try:
                        with open(HEATMAP_CSV_PATH, mode='a', newline='', encoding='utf-8') as f:
                            csv.writer(f).writerow([datetime.now().strftime("%Y-%m-%d %H:%M:%S"), jam_count])
                    except: pass

                heatmap_matrix += temp_heat
                heatmap_matrix = np.clip(heatmap_matrix, 0, 255) * 0.985 
                heatmap_blurred = cv2.GaussianBlur(heatmap_matrix, (61, 61), 0)
                heat_norm = np.clip(heatmap_blurred, 0, 180)
                heat_norm = (heat_norm / 180.0 * 255).astype(np.uint8)
                heat_color = cv2.applyColorMap(heat_norm, cv2.COLORMAP_JET)
                alpha = (heat_norm / 255.0) * 0.75 
                alpha = alpha[..., np.newaxis]
                frame = (heat_color * alpha + frame * (1 - alpha)).astype(np.uint8)

            if run_speed and speed_polygon is not None: cv2.polylines(frame, [speed_polygon], True, (0, 255, 255), 2)
            
            if run_redlight:
                if rl_monitor_polygon is not None:
                    cv2.polylines(frame, [rl_monitor_polygon], True, (0, 0, 255), 2)
                    cv2.line(frame, tuple(rl_monitor_polygon[2]), tuple(rl_monitor_polygon[3]), (0, 255, 255), 3)
                
                light_text = f"Den: {cur_light_s}"
                text_color = (0, 255, 255) if cur_light_s == 'YELLOW' else ((0, 0, 255) if cur_light_s == 'RED' else ((0, 255, 0) if cur_light_s == 'GREEN' else (255, 255, 255)))
                (tw, th), _ = cv2.getTextSize(light_text, 0, 0.8, 2)
                cv2.rectangle(frame, (10, 140 - th - 10), (10 + tw + 10, 140 + 5), (0, 0, 0), -1)
                cv2.putText(frame, light_text, (15, 140), 0, 0.8, text_color, 2)
                
                if rl_light_straight_roi != (0, 0, 0, 0):
                    rx, ry, rw, rh = rl_light_straight_roi
                    cv2.rectangle(frame, (rx, ry), (rx+rw, ry+rh), (255, 255, 255), 2)
                    cv2.putText(frame, "Light", (rx, ry-5), 0, 0.5, (255, 255, 255), 1)

            if run_wrongway and ww_polygon is not None: cv2.polylines(frame, [ww_polygon], True, (255, 0, 255), 2)
            if run_heatmap and heatmap_polygon is not None: cv2.polylines(frame, [heatmap_polygon], True, (0, 165, 255), 2)

            if boxes is not None and boxes.id is not None:
                for box in boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    class_name = model.names[int(box.cls[0])]
                    track_id = int(box.id[0]) if box.id is not None else -1
                    if class_name in ['car', 'motorcycle', 'truck', 'bus'] and track_id in vehicle_tracking_data:
                        data = vehicle_tracking_data[track_id]
                        box_color = globals().get('COLOR_MAP', {}).get(class_name, (255, 255, 255))
                        speed_int = int(data['speed'])
                        label, text_color = f"ID:{track_id} {class_name}", box_color
                        if run_speed and speed_int > 0: label += f" {speed_int}km/h"
                        if data['is_wrongway_err']: label, text_color, box_color = label + " [NGUOC CHIEU]", (0, 0, 255), (0, 0, 255)
                        elif data['is_redlight_err']: label, text_color, box_color = label + " [VUOT DEN DO]", (0, 0, 255), (0, 0, 255)
                        elif run_speed and speed_int > speed_limit_live: text_color = (0, 0, 255)
                        
                        cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 4 if data['pending_tele'] else 2)
                        cv2.putText(frame, label, (x1, y1 - 10), 0, 0.6, text_color, 2)
                    elif class_name == 'license_plate': 
                        cv2.rectangle(frame, (x1, y1), (x2, y2), globals().get('COLOR_MAP', {}).get('license_plate', (255, 0, 0)), 2)

            for box in boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                if model.names[int(box.cls[0])] == 'license_plate' and (x2 - x1) >= 25:
                    cy1, cy2 = max(0, int(y1 - (y2 - y1)*0.05)), min(DISPLAY_H, int(y2 + (y2 - y1)*0.05))
                    cx1, cx2 = max(0, int(x1 - (x2 - x1)*0.05)), min(DISPLAY_W, int(x2 + (x2 - x1)*0.05))
                    if cy2 > cy1 and cx2 > cx1:
                        plate_crop = cv2.resize(clean_frame[cy1:cy2, cx1:cx2], None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
                        gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY)
                        morph = cv2.erode(cv2.GaussianBlur(cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray), (3, 3), 0), np.ones((2, 2), np.uint8), iterations=1)
                        ocr_res = reader.readtext(morph, allowlist='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', decoder='beamsearch', detail=1)
                        if ocr_res:
                            val_res = [r for r in ocr_res if r[2] > 0.3]
                            if val_res:
                                val_res.sort(key=lambda x: x[0][0][1])
                                raw_text = re.sub(r'[^A-Z0-9]', '', "".join([r[1] for r in val_res]))
                                cln_txt = correct_vietnamese_plate(raw_text, 'car')
                                if 7 <= len(cln_txt) <= 9 and sum(c.isdigit() for c in cln_txt) >= 4:
                                    plate_txt = cln_txt[:4] + "-" + cln_txt[4:] if len(cln_txt) == 9 or (len(cln_txt) == 8 and cln_txt[3].isalpha()) else cln_txt[:3] + "-" + cln_txt[3:]
                                    cv2.putText(frame, f"BS: {plate_txt}", (x1, y2 + 20), 0, 0.8, (255, 255, 0), 2)
                                    px_c, py_c = (x1 + x2) // 2, (y1 + y2) // 2
                                    for v_box in boxes:
                                        if model.names[int(v_box.cls[0])] in ['car', 'motorcycle', 'truck', 'bus']:
                                            vx1, vy1, vx2, vy2 = map(int, v_box.xyxy[0])
                                            if (vx1 - 20) <= px_c <= (vx2 + 20) and (vy1 - 20) <= py_c <= (vy2 + 20):
                                                v_id = int(v_box.id[0]) if v_box.id is not None else -1
                                                if v_id in vehicle_tracking_data:
                                                    if v_id not in plate_buffer: plate_buffer[v_id] = []
                                                    plate_buffer[v_id].append(plate_txt)
                                                    if plate_buffer[v_id].count(plate_txt) >= 2:
                                                        data = vehicle_tracking_data[v_id]
                                                        if not data['tele_sent'] and data['pending_tele']:
                                                            
                                                            data['plate_text'] = plate_txt
                                                            v_type_csv = 'Ngược Chiều' if data['is_wrongway_err'] else ('Vượt Đèn Đỏ' if data['is_redlight_err'] else 'Quá Tốc Độ')
                                                            csv_speed = data['violation_speed'] if data['violation_speed'] > 0 else int(data['speed'])
                                                            time_str_csv = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                                                            try:
                                                                with open(CSV_FILE_PATH, mode='a', newline='', encoding='utf-8') as f:
                                                                    csv.writer(f).writerow([time_str_csv, v_id, globals().get('VI_CLASS_MAP', {}).get(data['v_class'], ''), csv_speed, plate_txt, v_type_csv])
                                                            except: pass

            for v_id, data in list(vehicle_tracking_data.items()):
                if data.get('pending_tele') and not data.get('tele_sent') and data.get('pending_tele_time') is not None:
                    if video_current_time - data['pending_tele_time'] > PLATE_CONFIRM_TIMEOUT or v_id not in current_frame_ids:
                        v_type_csv = 'Ngược Chiều' if data['is_wrongway_err'] else ('Vượt Đèn Đỏ' if data['is_redlight_err'] else 'Quá Tốc Độ')
                        v_type_tele = 'WRONGWAY' if data['is_wrongway_err'] else ('REDLIGHT' if data['is_redlight_err'] else 'SPEED')
                        
                        plate_txt = data.get('plate_text', 'Không rõ')
                        csv_speed = data['violation_speed'] if data['violation_speed'] > 0 else int(data['speed'])
                        time_str_csv = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        
                        try:
                            with open(CSV_FILE_PATH, mode='a', newline='', encoding='utf-8') as f:
                                csv.writer(f).writerow([time_str_csv, v_id, globals().get('VI_CLASS_MAP', {}).get(data['v_class'], ''), csv_speed, plate_txt, v_type_csv])
                        except: pass

                        try: save_event_to_db(v_id, globals().get('VI_CLASS_MAP', {}).get(data['v_class'], ''), csv_speed, plate_txt, v_type_csv, "Hệ thống AI FastAPI")
                        except: pass

                        if v_type_tele != 'NONE':
                            if data.get('best_crop') is not None:
                                cv2.imwrite(f"evidence/violation_{v_id}.jpg", data['best_crop'])
                            trigger_telegram(data, v_id, save_dir, speed_limit_live, violation_type=v_type_tele)
                        data['tele_sent'] = True 
                
                elif not data.get('tele_sent') and v_id not in current_frame_ids:
                    plate_txt = data.get('plate_text', 'Không rõ')
                    csv_speed = int(data.get('speed', 0))
                    time_str_csv = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    v_type_csv = 'Bình Thường' 
                    try:
                        with open(CSV_FILE_PATH, mode='a', newline='', encoding='utf-8') as f:
                            csv.writer(f).writerow([time_str_csv, v_id, globals().get('VI_CLASS_MAP', {}).get(data['v_class'], ''), csv_speed, plate_txt, v_type_csv])
                        save_event_to_db(v_id, globals().get('VI_CLASS_MAP', {}).get(data['v_class'], ''), csv_speed, plate_txt, v_type_csv, "Hệ thống AI FastAPI")
                    except: pass
                    data['tele_sent'] = True

            active_stats[video_id] = {"total": total_vehicles_counted, "violations": total_violations}

            _, buffer = cv2.imencode('.jpg', frame)
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            
        for v_id, data in list(vehicle_tracking_data.items()):
            if not data.get('tele_sent'):
                v_type_csv = 'Bình Thường' 
                if data['is_wrongway_err']: v_type_csv = 'Ngược Chiều'
                elif data['is_redlight_err']: v_type_csv = 'Vượt Đèn Đỏ'
                elif run_speed and int(data['speed']) > speed_limit_live: v_type_csv = 'Quá Tốc Độ'
                
                plate_txt = data.get('plate_text', 'Không rõ')
                csv_speed = data['violation_speed'] if data['violation_speed'] > 0 else int(data['speed'])
                time_str_csv = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                try:
                    with open(CSV_FILE_PATH, mode='a', newline='', encoding='utf-8') as f:
                        csv.writer(f).writerow([time_str_csv, v_id, globals().get('VI_CLASS_MAP', {}).get(data['v_class'], ''), csv_speed, plate_txt, v_type_csv])
                    save_event_to_db(v_id, globals().get('VI_CLASS_MAP', {}).get(data['v_class'], ''), csv_speed, plate_txt, v_type_csv, "Hệ thống AI FastAPI")
                except: pass

    except Exception as e:
        print(f"⚠️ Ngắt luồng Video ID: {video_id} - Lỗi: {e}")
        
    finally:
        cap.release()
# 🚦 Project ITS - Intelligent Transportation System

![Python](https://img.shields.io/badge/Python-3.11+-blue.svg?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=FastAPI&logoColor=white)
![React](https://img.shields.io/badge/ReactJS-20232A?style=flat&logo=react&logoColor=61DAFB)
![YOLOv8](https://img.shields.io/badge/AI_Model-YOLOv8_Small-yellow)
![Supabase](https://img.shields.io/badge/Database-Supabase_PostgreSQL-3ECF8E?logo=supabase)
![Cloudflare](https://img.shields.io/badge/Tunnel-Cloudflare-F38020?logo=cloudflare)

**Project ITS (Intelligent Transportation System)** là một giải pháp giám sát giao thông thông minh toàn diện, ứng dụng kiến trúc Edge-to-Cloud Microservices. Hệ thống có khả năng phân tích luồng video thời gian thực để nhận diện phương tiện, bám vết quỹ đạo và tự động phát hiện các hành vi vi phạm giao thông với độ chính xác cao.

---

## ✨ Tính năng nổi bật (Key Features)

- 👁️ **Nhận diện & Bám vết Real-time:** Sử dụng **YOLOv8s** và **ByteTrack** để duy trì định danh (ID) phương tiện, vượt qua rào cản che khuất trong điều kiện kẹt xe.
- 🚨 **Phân tích Vi phạm Tự động:** Áp dụng logic Không gian - Vector để bắt 3 lỗi cốt lõi: 
  - Vượt đèn đỏ (Ray Casting + Color Mask).
  - Đi ngược chiều (Vector Dot Product).
  - Quá tốc độ (Perspective Transform 2D -> 3D).
- 📸 **Trích xuất Biển số (ALPR):** Hệ thống OCR kết hợp tiền xử lý hình thái học và bộ lọc biểu thức chính quy (RegEx) chuẩn format Việt Nam.
- 🌍 **Trung tâm Điều hành Vĩ mô:** Tích hợp **TomTom Traffic API** vẽ bản đồ nhiệt (Heatmap) trực quan hóa mật độ kẹt xe toàn thành phố.
- 💬 **Cảnh báo Bất đồng bộ:** Tự động bắn thông báo vi phạm kèm hình ảnh Bounding Box về điện thoại qua **Telegram Bot**.
- 🤖 **Trợ lý ảo RAG:** Tích hợp LLM (Gemini 1.5 Flash) hỗ trợ truy vấn thông tin thời tiết và giao thông bằng ngôn ngữ tự nhiên, chống ảo giác dữ liệu.

---

## 🏗️ Kiến trúc Công nghệ (Tech Stack)

### 1. AI Core & Backend
- **Framework:** FastAPI (Asynchronous processing).
- **Computer Vision:** YOLOv8 (Ultralytics), OpenCV, EasyOCR/Tesseract.
- **Tracking Algorithm:** ByteTrack.

### 2. Frontend Dashboard
- **Core:** ReactJS (Vite).
- **Mapping:** React-Leaflet.
- **Charts:** Recharts.

### 3. Cloud & Infrastructure
- **Database:** Supabase (PostgreSQL) + Supabase Storage & Auth.
- **Networking:** Cloudflare Tunnel (Zero Trust Routing).

---

## 📂 Cấu trúc Repository

```text
Project_ITS/
├── backend/                # Mã nguồn FastAPI, tích hợp Models AI và Logic xử lý
├── frontend/               # Giao diện Web ReactJS Dashboard
├── .vscode/                # Cấu hình môi trường lập trình
├── .gitignore              # Cấu hình bỏ qua file rác và biến môi trường
├── cloudflared.exe         # Công cụ thiết lập đường hầm bảo mật Cloudflare
└── README.md               # Tài liệu dự án
```
🚀 Hướng dẫn cài đặt (Installation & Setup)
Yêu cầu hệ thống (Prerequisites)
Python 3.11+

Node.js 18+ & npm

GPU NVIDIA (Khuyến nghị để chạy YOLO mượt mà).

# Bước 1: Thiết lập Backend (AI Core)
cd backend
python -m venv venv
Kích hoạt môi trường ảo:
Windows: .\venv\Scripts\activate
Linux/Mac: source venv/bin/activate

pip install -r requirements.txt
Tạo file .env trong thư mục backend và khai báo các khóa API:

## Đoạn mã
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
TOMTOM_API_KEY=your_tomtom_key
GEMINI_API_KEY=your_gemini_key
# Bước 2: Thiết lập Frontend (Dashboard)
cd frontend
npm install

Tạo file .env trong thư mục frontend:

VITE_API_BASE_URL=https://<your-cloudflare-tunnel-url>
# Bước 3: Khởi chạy hệ thống
1. Mở đường hầm Cloudflare Tunnel:
Chạy file thực thi để mở kết nối bảo mật nội bộ ra Internet.

cloudflared.exe tunnel --url http://localhost:8000
2. Khởi động Backend:

cd backend
uvicorn main:app --reload
3. Khởi động Frontend:

cd frontend
npm run dev
# 👨‍💻 Tác giả
Nguyễn Thành Tâm

Đại học: Phân hiệu Trường Đại học Thủy Lợi (Cơ sở TP.HCM).

Chuyên ngành: Công nghệ thông tin.

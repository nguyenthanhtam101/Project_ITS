import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Sửa lỗi mất icon mặc định của Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MapTab = () => {
  // Tọa độ trung tâm TP.HCM
  const centerPosition = [10.8033, 106.6845];
  
  // Dữ liệu giả lập các trạm Camera
  const cameras = [
    { id: 1, name: "Trạm Ngã tư Hàng Xanh", pos: [10.8015, 106.7111], status: "Hoạt động" },
    { id: 2, name: "Trạm Cầu Sài Gòn", pos: [10.7961, 106.7262], status: "Kẹt xe" },
    { id: 3, name: "Trạm Vòng xoay Dân Chủ", pos: [10.7764, 106.6824], status: "Hoạt động" },
    { id: 4, name: "Trạm CMT8", pos: [10.7715, 106.6895], status: "Hoạt động" }
  ];

  // Dữ liệu Khu Vực Lân Cận
  const nearbyAreas = [
    { id: 1, name: "Quang Trung - Số 625" },
    { id: 2, name: "Trần Quang Khải - Trần Khắc Chân" },
    { id: 3, name: "Tô Ngọc Vân - TX25" },
    { id: 4, name: "Quốc Lộ 13 - Cầu Ông Dầu" },
    { id: 5, name: "CMT8 - Bùi Thị Xuân" }
  ];

  return (
    <div className="flex flex-col gap-6 mt-4 pb-8">
      
      {/* ================= KHỐI TRÊN: BẢN ĐỒ & THỜI TIẾT ================= */}
      <div className="flex flex-col xl:flex-row gap-6">
        
        {/* Bản Đồ Camera (Trái) */}
        <div className="w-full xl:w-2/3 bg-[#0A0D10] border border-gray-800 rounded-xl p-5 shadow-lg flex flex-col">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center">
            <span className="mr-2">🗺️</span> Bản Đồ Camera TP.Hồ Chí Minh
          </h2>
          <div className="h-[400px] border border-gray-700 rounded-lg overflow-hidden relative z-0 mb-3">
            <MapContainer center={centerPosition} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png" />
              {cameras.map(cam => (
                <Marker key={cam.id} position={cam.pos}>
                  <Popup>
                    <div className="text-gray-800 font-sans">
                      <h3 className="font-bold text-sm text-blue-600">{cam.name}</h3>
                      <p className="text-xs">Trạng thái: <b className={cam.status === "Kẹt xe" ? "text-red-500" : "text-green-500"}>{cam.status}</b></p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
          <p className="text-gray-400 text-sm">📍 Tọa độ GPS: 10.8033, 106.6845 | Khu vực: TP.HCM, Việt Nam</p>
        </div>

        {/* Thời Tiết Thực Tế (Phải) */}
        <div className="w-full xl:w-1/3 bg-[#0A0D10] border border-gray-800 rounded-xl p-5 shadow-lg flex flex-col">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center">
            <span className="mr-2">⛅</span> Thời Tiết Thực Tế
          </h2>
          <div className="bg-[#161B22] border border-gray-700 rounded-xl p-6 flex-1 flex flex-col items-center justify-center">
            <div className="text-6xl font-bold text-[#00E5FF] mb-2 drop-shadow-[0_0_10px_rgba(0,229,255,0.3)]">32.5°C</div>
            <div className="text-gray-400 mb-8 font-medium">TP. Hồ Chí Minh</div>
            
            <div className="w-full grid grid-cols-2 gap-y-6 text-sm text-gray-300">
              <div className="flex items-center gap-2">
                <span className="text-green-400 text-lg">🍃</span> Gió: 0.6 km/h
              </div>
              <div className="flex items-center gap-2">
                <span className="text-yellow-400 text-lg">⛅</span> Mưa: 3%
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-400 text-lg">💧</span> Độ ẩm: 59%
              </div>
              <div className="flex items-center gap-2">
                <span className="text-red-400 text-lg">🚦</span> Feed: 0.5s
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= KHỐI DƯỚI: KHU VỰC LÂN CẬN ================= */}
      <div className="w-full bg-[#0A0D10] border border-gray-800 rounded-xl p-5 shadow-lg">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center">
          <span className="mr-2 text-blue-500">🔄</span> Khu Vực Lân Cận
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {nearbyAreas.map((area) => (
            <div key={area.id} className="flex flex-col items-center gap-3 group cursor-pointer">
              {/* Dùng ảnh Placeholder tông xám tối để giả lập Thumbnail Camera */}
              <div className="w-full h-28 bg-[#161B22] border border-gray-700 rounded-lg overflow-hidden relative group-hover:border-cyan-500 transition-all">
                <img 
                  src={`https://via.placeholder.com/300x150/1F2937/FFFFFF?text=Cam+${area.id}`} 
                  alt={area.name} 
                  className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                />
              </div>
              <button className="bg-[#161B22] border border-gray-700 text-xs text-gray-300 w-full py-3 px-2 rounded-lg group-hover:bg-cyan-900 group-hover:text-white transition-all text-center h-12 flex items-center justify-center">
                {area.name}
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default MapTab;
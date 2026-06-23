import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const ROI_COLORS = {
  speed: { hex: '#FFFF00', rgba: 'rgba(255, 255, 0, 0.2)', name: 'Đo Tốc Độ', key: 'runSpeed' },
  wrongway: { hex: '#FF00FF', rgba: 'rgba(255, 0, 255, 0.2)', name: 'Bắt Ngược Chiều', key: 'runWrongway' },
  redlight: { hex: '#FF0000', rgba: 'rgba(255, 0, 0, 0.2)', name: 'Vùng Vượt Đèn Đỏ', key: 'runRedlight' },
  trafficLight: { hex: '#00FFFF', rgba: 'rgba(0, 255, 255, 0.2)', name: 'Vị Trí Đèn Tín Hiệu', key: 'runRedlight' },
  heatmap: { hex: '#FFA500', rgba: 'rgba(255, 165, 0, 0.2)', name: 'Đo Mật Độ Kẹt Xe', key: 'showHeatmap' }
};

const MonitorTab = () => {
  const [sourceType, setSourceType] = useState('offline');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  
  const [cctvList, setCctvList] = useState([]);
  const [cctvLocation, setCctvLocation] = useState('');

  const [selectedFile, setSelectedFile] = useState(null);
  const [streamUrl, setStreamUrl] = useState('');
  const [currentVideoId, setCurrentVideoId] = useState(null); 
  const [isLoading, setIsLoading] = useState(false);

  const [weather, setWeather] = useState({ temp: '--', wind: '--', humidity: '--', rain: '--' });
  const [kpiStats, setKpiStats] = useState({ total: '--', violations: '--' });
  
  // ĐÃ FIX 1: Dùng state để lưu tọa độ thay vì fix cứng, mặc định là TP.HCM
  const [currentCamPos, setCurrentCamPos] = useState([10.8033, 106.6845]);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        // Cập nhật thời tiết động theo tọa độ của bản đồ
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${currentCamPos[0]}&longitude=${currentCamPos[1]}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&hourly=precipitation_probability&timezone=Asia/Bangkok&forecast_days=1`;
        const res = await axios.get(url);
        const data = res.data;
        const currentHour = new Date().getHours();
        setWeather({
          temp: data.current.temperature_2m,
          wind: data.current.wind_speed_10m,
          humidity: data.current.relative_humidity_2m,
          rain: data.hourly.precipitation_probability[currentHour] || '--'
        });
      } catch (error) {
        console.error("Lỗi lấy thời tiết:", error);
      }
    };
    fetchWeather();
  }, [currentCamPos]); // Load lại thời tiết khi đổi tọa độ camera

  useEffect(() => {
    const fetchCCTV = async () => {
      try {
        const res = await axios.get('https://bruce-racial-bureau-stopped.trycloudflare.com/api/admin/table/cameras', {
          headers: { "ngrok-skip-browser-warning": "true" }
        });
        setCctvList(res.data);
        if (res.data.length > 0) {
          setCctvLocation(res.data[0].name); 
        }
      } catch (e) {
        console.error("Lỗi tải danh sách camera:", e);
      }
    };
    fetchCCTV();
  }, []);

  // ĐÃ FIX 2: Tự động cập nhật tọa độ bản đồ khi người dùng chọn Camera từ Dropdown
  useEffect(() => {
    if (sourceType === 'opencctv' && cctvLocation) {
      const selectedCam = cctvList.find(c => c.name === cctvLocation);
      if (selectedCam && selectedCam.lat && selectedCam.lon) {
        setCurrentCamPos([parseFloat(selectedCam.lat), parseFloat(selectedCam.lon)]);
      }
    }
  }, [cctvLocation, sourceType, cctvList]);

  useEffect(() => {
    let interval;
    if (streamUrl && currentVideoId) {
      interval = setInterval(async () => {
        try {
          const res = await axios.get(`https://bruce-racial-bureau-stopped.trycloudflare.com/api/stats/${currentVideoId}`, {
            headers: { "ngrok-skip-browser-warning": "true" }
          });
          if (res.data) {
            setKpiStats({ total: res.data.total, violations: res.data.violations });
          }
        } catch (e) {
          console.error("Lỗi lấy thống kê KPI:", e);
        }
      }, 180000);
    } else {
      setKpiStats({ total: '--', violations: '--' });
    }
    return () => clearInterval(interval);
  }, [streamUrl, currentVideoId]);

  const [aiSettings, setAiSettings] = useState({
    runSpeed: false, runRedlight: false, runWrongway: false, showHeatmap: false,
    speedLimit: 55, jamThreshold: 15, allowMotorbikeRightTurn: true, allowCarRightTurn: true,
  });

  const [rois, setRois] = useState({ speed: [], wrongway: [], redlight: [], trafficLight: [], heatmap: [] });
  const [activeRoiType, setActiveRoiType] = useState(null);
  
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const sendLiveSettings = async (updatedSettings, currentRois) => {
    if (!currentVideoId) return;
    const finalSettings = { ...updatedSettings, rois: currentRois };
    const formData = new FormData();
    formData.append('settings', JSON.stringify(finalSettings));
    try {
      await axios.post(`https://bruce-racial-bureau-stopped.trycloudflare.com/api/update-settings/${currentVideoId}`, formData, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
    } catch (e) { console.error("Lỗi cập nhật cấu hình live", e); }
  };

  const handleCanvasClick = (e) => {
    if (!streamUrl) {
      alert("⚠️ Bạn phải bấm CHẠY CAMERA trước khi vẽ vùng kiểm soát (ROI)!");
      return;
    }
    
    if (!activeRoiType) {
      alert("👉 Vui lòng chọn một chức năng (Đo Tốc Độ, Vượt Đèn Đỏ...) ở menu bên trái trước khi bắt đầu vẽ!");
      return;
    }

    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    setRois(prev => {
      const currentPts = prev[activeRoiType];
      if (currentPts.length >= 4) return prev; 
      return { ...prev, [activeRoiType]: [...currentPts, { x, y }] };
    });
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    if (!activeRoiType) return;
    setRois(prev => ({ ...prev, [activeRoiType]: prev[activeRoiType].slice(0, -1) }));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!activeRoiType) return; 

      if (e.key === 'c' || e.key === 'C') {
        const newRois = { ...rois, [activeRoiType]: [] };
        setRois(newRois);
        sendLiveSettings(aiSettings, newRois);
      }
      if (e.key === 'Enter') {
        if (rois[activeRoiType].length === 4) {
          alert(`✅ Đã lưu vùng ${ROI_COLORS[activeRoiType].name}! AI bắt đầu tính toán.`);
          sendLiveSettings(aiSettings, rois);
        } else {
          alert('⚠️ Bạn phải vẽ đủ 4 điểm cho vùng này trước khi Lưu!');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rois, activeRoiType, aiSettings, currentVideoId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    Object.keys(rois).forEach(type => {
      const pts = rois[type];
      if (pts.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = ROI_COLORS[type].hex;
        ctx.lineWidth = type === activeRoiType ? 3 : 1.5;
        ctx.fillStyle = ROI_COLORS[type].rgba;

        pts.forEach((pt, index) => {
          const px = pt.x * canvas.width;
          const py = pt.y * canvas.height;
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });

        if (pts.length === 4) {
          ctx.closePath();
          ctx.fill();
        }
        ctx.stroke();

        pts.forEach((pt) => {
          const px = pt.x * canvas.width;
          const py = pt.y * canvas.height;
          ctx.beginPath();
          ctx.arc(px, py, type === activeRoiType ? 5 : 3, 0, 2 * Math.PI);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = ROI_COLORS[type].hex;
          ctx.stroke();
        });
      }
    });
  }, [rois, streamUrl, activeRoiType]);

  const handleSettingChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newVal = type === 'checkbox' ? checked : Number(value);
    const newSettings = { ...aiSettings, [name]: newVal };
    setAiSettings(newSettings);
    sendLiveSettings(newSettings, rois); 
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) { setSelectedFile(file); setStreamUrl(""); }
  };

  const handleUpload = async () => {
    setIsLoading(true);
    try {
      const finalSettings = { ...aiSettings, rois: rois };
      const formData = new FormData();
      formData.append('settings', JSON.stringify(finalSettings));
      
      let resData = null;
      if (sourceType === 'offline' && selectedFile) {
        formData.append('file', selectedFile);
        const response = await axios.post('https://bruce-racial-bureau-stopped.trycloudflare.com/api/upload-video', formData, {
          headers: { "ngrok-skip-browser-warning": "true" }
        });
        resData = response.data;
      } 
      else if (sourceType === 'youtube' && youtubeUrl) {
        formData.append('url', youtubeUrl);
        const response = await axios.post('https://bruce-racial-bureau-stopped.trycloudflare.com/api/upload-youtube', formData, {
          headers: { "ngrok-skip-browser-warning": "true" }
        });
        if(response.data.error) {
           alert("❌ Lỗi lấy luồng YouTube: " + response.data.error);
        } else {
           resData = response.data;
        }
      } 
      else if (sourceType === 'opencctv' && cctvLocation) {
        formData.append('camera_name', cctvLocation);
        const response = await axios.post('https://bruce-racial-bureau-stopped.trycloudflare.com/api/upload-cctv', formData, {
          headers: { "ngrok-skip-browser-warning": "true" }
        });
        if(response.data.error) {
           alert("❌ Lỗi CCTV: " + response.data.error);
        } else {
           resData = response.data;
        }
      }
      else {
        alert(`Vui lòng cung cấp dữ liệu cho nguồn ${sourceType}!`);
      }

      if (resData && resData.video_id) {
        setCurrentVideoId(resData.video_id);
        // ĐÃ FIX 3: Gắn timestamp vào đuôi URL để chặn trình duyệt Chrome lưu cache làm đen màn hình
        setStreamUrl(`https://bruce-racial-bureau-stopped.trycloudflare.com/api/stream-video/${resData.video_id}?t=${new Date().getTime()}`);
      }
    } catch (error) {
      alert("❌ Không thể kết nối tới Backend!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopSystem = () => {
    setStreamUrl("");
    setCurrentVideoId(null);
    setRois({ speed: [], wrongway: [], redlight: [], trafficLight: [], heatmap: [] }); 
    setSelectedFile(null);
    setIsLoading(false);
    window.stop(); 
  };

  const nearbyAreas = [
    { id: 1, name: "Quang Trung - Số 625" },
    { id: 2, name: "Trần Quang Khải - Trần Khắc Chân" },
    { id: 3, name: "Tô Ngọc Vân - TX25" },
    { id: 4, name: "Quốc Lộ 13 - Cầu Ông Dầu" },
    { id: 5, name: "CMT8 - Bùi Thị Xuân" }
  ];

  return (
    <div className="flex flex-col xl:flex-row gap-6 mt-4 pb-10">
      
      <div className="w-full xl:w-1/4 flex flex-col gap-4">
        <div className="bg-[#11151A] border border-gray-700 rounded-xl p-5 shadow-lg flex-1">
          <h3 className="text-xl font-bold text-[#00E5FF] mb-4 border-b border-gray-700 pb-2">🎛️ Nguồn Camera</h3>

          <div className="flex bg-[#0A0D10] border border-gray-700 rounded-lg p-1 mb-4">
            <button onClick={() => setSourceType('offline')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${sourceType === 'offline' ? 'bg-[#00E5FF] text-gray-900 shadow-[0_0_10px_rgba(0,229,255,0.5)]' : 'text-gray-400 hover:text-white'}`}>📁 OFFLINE</button>
            <button onClick={() => setSourceType('youtube')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${sourceType === 'youtube' ? 'bg-[#00E5FF] text-gray-900 shadow-[0_0_10px_rgba(0,229,255,0.5)]' : 'text-gray-400 hover:text-white'}`}>▶ YOUTUBE</button>
            <button onClick={() => setSourceType('opencctv')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${sourceType === 'opencctv' ? 'bg-[#00E5FF] text-gray-900 shadow-[0_0_10px_rgba(0,229,255,0.5)]' : 'text-gray-400 hover:text-white'}`}>🌐 CCTV</button>
          </div>

          <div className="mb-6">
            {sourceType === 'offline' && (
              <div>
                <label className="block text-gray-400 text-sm mb-2">Tải Video Từ Máy:</label>
                <div className="flex items-center gap-2 mb-3">
                  <input type="file" accept="video/*" onChange={handleFileChange} className="w-full text-sm text-gray-300 file:mr-2 file:py-2 file:px-4 file:rounded file:border-0 file:bg-[#1F2937] file:text-white file:font-bold cursor-pointer" />
                </div>
              </div>
            )}
            {sourceType === 'youtube' && (
              <div>
                <label className="block text-gray-400 text-sm mb-2">Link YouTube Live:</label>
                <input type="text" placeholder="Dán link YouTube..." value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} className="w-full bg-[#0A0D10] text-white border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 mb-3" />
              </div>
            )}
            {sourceType === 'opencctv' && (
              <div>
                <label className="block text-gray-400 text-sm mb-2">Chọn Trạm OpenCCTV:</label>
                <select value={cctvLocation} onChange={(e) => setCctvLocation(e.target.value)} className="w-full bg-[#0A0D10] text-white border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 mb-3">
                  {cctvList.length > 0 ? (
                    cctvList.map((cam, idx) => (
                      <option key={idx} value={cam.name}>{cam.name}</option>
                    ))
                  ) : (
                    <option value="">Chưa có camera nào (Thêm ở Admin)</option>
                  )}
                </select>
              </div>
            )}
            
            <button onClick={handleUpload} disabled={isLoading || (sourceType === 'offline' && !selectedFile)} className={`w-full py-3 font-bold rounded transition-all ${isLoading || (sourceType === 'offline' && !selectedFile) ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]'}`}>
              {isLoading ? '⏳ ĐANG KẾT NỐI...' : '▶ CHẠY CAMERA'}
            </button>
          </div>

          <h4 className="text-md font-bold text-white mb-3">🛠️ Chức Năng & Vẽ Vùng AI</h4>
          <div className="flex flex-col gap-3 mb-6">
            {Object.keys(ROI_COLORS).map(type => {
              const featureKey = ROI_COLORS[type].key;
              const isActive = aiSettings[featureKey];
              const isDrawing = activeRoiType === type;
              return (
                <button
                  key={type}
                  onClick={() => {
                    let newSettings = { ...aiSettings };
                    if (activeRoiType !== type) {
                      newSettings[featureKey] = true;
                      setAiSettings(newSettings);
                      setActiveRoiType(type);
                    } else {
                      newSettings[featureKey] = !isActive;
                      setAiSettings(newSettings);
                    }
                    sendLiveSettings(newSettings, rois);
                  }}
                  className={`w-full py-2 px-3 text-sm font-bold rounded-md transition-all flex items-center justify-between border ${isActive ? 'text-gray-900 shadow-md' : 'text-gray-400 bg-[#161B22] border-gray-700 hover:bg-gray-800'}`}
                  style={{
                    backgroundColor: isActive ? ROI_COLORS[type].hex : undefined,
                    borderColor: isDrawing ? '#FFFFFF' : undefined,
                    boxShadow: isDrawing ? `0 0 10px ${ROI_COLORS[type].hex}` : undefined
                  }}
                >
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: ROI_COLORS[type].hex, border: '1px solid #333' }}></div>
                    {ROI_COLORS[type].name}
                  </span>
                  {isActive && <span className="text-xs bg-black/40 px-2 py-1 rounded text-white">{isDrawing ? '🖌️ Đang vẽ' : 'Đã Bật'}</span>}
                </button>
              )
            })}
          </div>

          <h4 className="text-md font-bold text-white mb-3">⚙️ Tùy Chỉnh Chuyên Sâu</h4>
          <div className="space-y-5 mb-6">
            <div>
              <label className="flex justify-between text-gray-400 text-sm mb-2"><span>Giới hạn tốc độ:</span><span className="text-[#00E5FF] font-bold">{aiSettings.speedLimit} km/h</span></label>
              <input type="range" name="speedLimit" min="20" max="120" value={aiSettings.speedLimit} onChange={handleSettingChange} className="w-full accent-[#00E5FF] cursor-pointer" />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-700">
            <label className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" name="allowMotorbikeRightTurn" checked={aiSettings.allowMotorbikeRightTurn} onChange={handleSettingChange} className="w-5 h-5 accent-[#00E676] cursor-pointer bg-gray-800" /><span className="text-gray-300 text-sm">Cho phép Xe Máy rẽ phải</span></label>
            <label className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" name="allowCarRightTurn" checked={aiSettings.allowCarRightTurn} onChange={handleSettingChange} className="w-5 h-5 accent-[#00E676] cursor-pointer bg-gray-800" /><span className="text-gray-300 text-sm">Cho phép Ô Tô rẽ phải</span></label>
            
            <button onClick={handleStopSystem} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded mt-4 shadow-[0_4px_15px_rgba(34,197,94,0.4)] transition-all">
              DỪNG HỆ THỐNG
            </button>
            <div className="pt-4 border-t border-gray-700 mt-4"><button className="w-full bg-transparent border border-gray-600 hover:bg-gray-800 text-gray-400 font-bold py-2 rounded-lg">🚪 ĐĂNG XUẤT</button></div>
          </div>
        </div>
      </div>

      <div className="w-full xl:w-3/4 flex flex-col gap-6">
        
        <div className="bg-[#11151A] border border-gray-700 rounded-xl p-4 shadow-lg flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-300 flex items-center">
              🎥 <span className="ml-2">Nguồn phát: {sourceType === 'opencctv' ? cctvLocation : (sourceType === 'youtube' ? 'YouTube Live' : (selectedFile ? selectedFile.name : 'Chưa có'))}</span>
            </h3>
            <div className="bg-[#1A202C] border border-gray-700 text-xs text-gray-400 px-4 py-2 rounded-lg flex gap-4">
              <span><b className="text-[#00E5FF]">Chuột Trái:</b> Đánh dấu</span>
              <span><b className="text-red-400">Chuột Phải:</b> Xóa 1 điểm</span>
              <span><b className="text-yellow-400">Phím C:</b> Xóa vùng đang chọn</span>
              <span><b className="text-green-400">Phím Enter:</b> Lưu ROI</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-4">
            <div className="bg-[#161B22] border border-gray-700 rounded-lg p-4 flex flex-col items-center justify-center shadow-[0_0_10px_rgba(0,229,255,0.1)]">
              <span className="text-gray-400 text-sm mb-1 uppercase tracking-wider font-bold">Lưu lượng hiện tại</span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-[#00E5FF]">{kpiStats.total}</span>
                <span className="text-gray-500 text-sm">xe</span>
              </div>
            </div>
            
            <div className="bg-[#161B22] border border-gray-700 rounded-lg p-4 flex flex-col items-center justify-center shadow-[0_0_10px_rgba(255,0,0,0.1)]">
              <span className="text-gray-400 text-sm mb-1 uppercase tracking-wider font-bold">Số lượng vi phạm</span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-red-500">{kpiStats.violations}</span>
                <span className="text-gray-500 text-sm">lượt</span>
              </div>
            </div>
          </div>

          <div 
            ref={containerRef}
            className="relative w-full aspect-video bg-black rounded-lg border border-gray-800 overflow-hidden cursor-crosshair"
            onClick={handleCanvasClick}
            onContextMenu={handleContextMenu}
          >
            {streamUrl ? (
              <img src={streamUrl} alt="Live AI Stream" className="w-full h-full object-fill pointer-events-none" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 pointer-events-none">
                <span className="text-7xl mb-4 block">📺</span>
                <p className="text-xl font-bold">Hãy bấm CHẠY CAMERA để bắt đầu kết nối</p>
              </div>
            )}
            <canvas ref={canvasRef} className="absolute inset-0 z-10" />
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-6">
          <div className="w-full xl:w-2/3 bg-[#11151A] border border-gray-700 rounded-xl p-4 shadow-lg h-[300px] flex flex-col">
            <h3 className="text-md font-bold text-gray-300 mb-2">📍 Bản Đồ Camera Giám Sát</h3>
            <div className="flex-1 rounded-lg overflow-hidden border border-gray-800 relative z-0">
              {/* ĐÃ FIX 4: Thêm key={currentCamPos} để ép bản đồ tự động dời đến tọa độ mới */}
              <MapContainer key={`${currentCamPos[0]}-${currentCamPos[1]}`} center={currentCamPos} zoom={13} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png" />
                <Circle center={currentCamPos} pathOptions={{ color: '#00E5FF', fillColor: '#00E5FF', fillOpacity: 0.3 }} radius={150} />
                <Marker position={currentCamPos}><Popup>Camera Đang Xem</Popup></Marker>
              </MapContainer>
            </div>
          </div>

          <div className="w-full xl:w-1/3 bg-[#11151A] border border-gray-700 rounded-xl p-5 shadow-lg flex flex-col justify-center">
            <h2 className="text-lg font-bold text-gray-300 mb-4 flex items-center"><span className="mr-2">⛅</span> Thời Tiết Thực Tế</h2>
            <div className="bg-[#161B22] border border-gray-800 rounded-xl p-4 flex flex-col items-center">
              <div className="text-5xl font-bold text-[#00E5FF] mb-1">{weather.temp}°C</div>
              <div className="text-gray-400 mb-6 text-sm">{sourceType === 'opencctv' ? cctvLocation : 'Khu vực hiện tại'}</div>
              <div className="w-full grid grid-cols-2 gap-y-4 text-xs text-gray-300">
                <div className="flex items-center gap-2"><span className="text-green-400 text-base">🍃</span> Gió: {weather.wind} km/h</div>
                <div className="flex items-center gap-2"><span className="text-yellow-400 text-base">⛅</span> Mưa: {weather.rain}%</div>
                <div className="flex items-center gap-2"><span className="text-blue-400 text-base">💧</span> Độ ẩm: {weather.humidity}%</div>
                <div className="flex items-center gap-2"><span className="text-red-400 text-base">🚦</span> Feed: 0.5s</div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full bg-[#11151A] border border-gray-700 rounded-xl p-5 shadow-lg mb-10">
          <h2 className="text-lg font-bold text-gray-300 mb-4 flex items-center"><span className="mr-2 text-blue-500">🔄</span> Khu Vực Lân Cận</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {nearbyAreas.map((area) => (
              <div key={area.id} className="flex flex-col items-center gap-2 group cursor-pointer">
                <div className="w-full h-24 bg-[#161B22] border border-gray-800 rounded-lg flex items-center justify-center text-gray-600 group-hover:border-[#00E5FF] transition-all overflow-hidden">
                  <span className="text-3xl">📹</span>
                </div>
                <button className="bg-[#161B22] border border-gray-800 text-xs text-gray-400 w-full py-2 px-1 rounded group-hover:bg-[#00E5FF] group-hover:text-black group-hover:font-bold transition-all text-center h-10 flex items-center justify-center">
                  {area.name}
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default MonitorTab;
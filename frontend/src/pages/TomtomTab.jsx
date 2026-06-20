import { useState, useEffect } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import 'leaflet/dist/leaflet.css';

const CHART_COLORS = ['#00E5FF', '#FF00FF', '#00FF00', '#FFA500', '#FF0000', '#FFFF00', '#8A2BE2'];

const TomtomTab = () => {
  const [trafficData, setTrafficData] = useState([]);
  const [historyData, setHistoryData] = useState([]); // Lưu lịch sử để vẽ Line Chart
  const [lastUpdate, setLastUpdate] = useState('--:--:--');
  const [isRefreshing, setIsRefreshing] = useState(false); // Trạng thái hiệu ứng tải dữ liệu

  // TÁCH HÀM FETCH ĐỂ DÙNG CHUNG CHO CẢ EFFECT VÀ NÚT BẤM
  const fetchTraffic = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await axios.get('https://biography-dollars-hydraulic-remind.trycloudflare.com/api/tomtom', {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      if (res.data && res.data.length > 0) {
        setTrafficData(res.data);
        
        const nowTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastUpdate(nowTime);

        // Cập nhật dữ liệu lịch sử cho biểu đồ Line Trend
        setHistoryData(prev => {
          const snapshot = { time: nowTime };
          res.data.forEach(d => {
            snapshot[d.node_name] = d.curr_speed;
          });
          const newHistory = [...prev, snapshot];
          return newHistory.length > 15 ? newHistory.slice(newHistory.length - 15) : newHistory;
        });
      }
    } catch (e) {
      console.error("Lỗi lấy dữ liệu TomTom:", e);
    } finally {
      if (isManual) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTraffic();
    const interval = setInterval(() => fetchTraffic(false), 10000); // Tự động quét sau mỗi 10 giây
    return () => clearInterval(interval);
  }, []);

  // TÍNH TOÁN DỮ LIỆU THỐNG KÊ KPIs
  const totalNodes = trafficData.length;
  const ketCung = trafficData.filter(d => d.status === 'Kẹt Cứng').length;
  const unU = trafficData.filter(d => d.status === 'Ùn Ứ').length;
  const thongThoang = trafficData.filter(d => d.status === 'Thông Thoáng').length;

  const getStatusColor = (status) => {
    if (status === 'Kẹt Cứng') return '#EF4444'; // Đỏ
    if (status === 'Ùn Ứ') return '#F97316'; // Cam
    return '#22C55E'; // Xanh lá
  };

  // Sắp xếp lấy dữ liệu Top 5 Nút Giao Ùn Tắc Nhất
  const topCongested = [...trafficData].sort((a, b) => b.cong_pct - a.cong_pct).slice(0, 5);

  // Phân bổ tỷ trọng cho Biểu đồ Tròn
  const pieData = [
    { name: 'Kẹt Cứng', value: ketCung, color: '#EF4444' },
    { name: 'Ùn Ứ', value: unU, color: '#F97316' },
    { name: 'Thông Thoáng', value: thongThoang, color: '#22C55E' }
  ].filter(d => d.value > 0);

  return (
    <div className="flex flex-col gap-6 mt-4 pb-10">
      
      {/* 1. KHUNG DASHBOARD THỐNG KÊ (KPI) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#11151A] border border-gray-700 rounded-xl p-5 shadow-lg flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm font-bold uppercase">Tổng Nút Giao</p>
            <p className="text-3xl font-bold text-[#00E5FF] mt-1">{totalNodes || '--'}</p>
          </div>
          <div className="text-4xl opacity-80">📍</div>
        </div>
        
        <div className="bg-[#11151A] border border-red-900 rounded-xl p-5 shadow-[0_0_15px_rgba(239,68,68,0.15)] flex items-center justify-between">
          <div>
            <p className="text-red-400 text-sm font-bold uppercase">Kẹt Cứng (&gt;50%)</p>
            <p className="text-3xl font-bold text-red-500 mt-1">{ketCung}</p>
          </div>
          <div className="text-4xl opacity-80">🚨</div>
        </div>

        <div className="bg-[#11151A] border border-orange-900 rounded-xl p-5 shadow-[0_0_15px_rgba(249,115,22,0.15)] flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-sm font-bold uppercase">Ùn Ứ (&gt;30%)</p>
            <p className="text-3xl font-bold text-orange-500 mt-1">{unU}</p>
          </div>
          <div className="text-4xl opacity-80">⚠️</div>
        </div>

        <div className="bg-[#11151A] border border-green-900 rounded-xl p-5 shadow-[0_0_15px_rgba(34,197,94,0.15)] flex items-center justify-between">
          <div>
            <p className="text-green-400 text-sm font-bold uppercase">Thông Thoáng</p>
            <p className="text-3xl font-bold text-green-500 mt-1">{thongThoang}</p>
          </div>
          <div className="text-4xl opacity-80">✅</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* 2. KHUNG BẢN ĐỒ LIVE TOMTOM (Chiếm 2/3 bề ngang) */}
        <div className="xl:col-span-2 bg-[#11151A] border border-gray-700 rounded-xl p-4 shadow-lg flex flex-col h-[500px]">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-bold text-gray-300 flex items-center">🗺️ Bản Đồ Lưu Lượng TomTom</h3>
            
            {/* CỤM NÚT BẤM CẬP NHẬT VÀ THỜI GIAN LÀM MỚI */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => { fetchTraffic(true); }}
                disabled={isRefreshing}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 ${
                  isRefreshing 
                    ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed' 
                    : 'bg-[#00E5FF] text-gray-900 border-[#00E5FF] hover:bg-[#00b2cc] shadow-[0_0_10px_rgba(0,229,255,0.2)]'
                }`}
              >
                {isRefreshing ? '⏳ ĐANG TẢI...' : '🔄 CẬP NHẬT'}
              </button>
              <span className="text-xs text-gray-400 bg-[#161B22] px-3 py-1.5 rounded-full border border-gray-700">
                Cập nhật lần cuối: <b className="text-[#00E5FF]">{lastUpdate}</b>
              </span>
            </div>
          </div>
          
          <div className="flex-1 rounded-lg overflow-hidden border border-gray-800 relative z-0">
            <MapContainer center={[10.79, 106.68]} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png" />
              {trafficData.map((node, idx) => (
                <CircleMarker 
                  key={idx} center={[node.lat, node.lon]} radius={12}
                  pathOptions={{ color: getStatusColor(node.status), fillColor: getStatusColor(node.status), fillOpacity: 0.7 }}
                >
                  <Popup>
                    <div className="text-gray-800 font-bold min-w-[200px]">
                      <p className="text-lg border-b pb-1 mb-2 text-center text-blue-800">{node.node_name}</p>
                      <p className="mb-1">📍 <b>Khu vực:</b> {node.district}</p>
                      <p className="mb-1">⚡ <b>Tốc độ:</b> <span className="text-blue-600">{node.curr_speed} / {node.free_speed} km/h</span></p>
                      <p className="mb-1">🔥 <b>Mức ùn tắc:</b> <span className="text-red-600">{node.cong_pct}%</span></p>
                      <p className="mt-2 text-center py-1 rounded text-white" style={{ backgroundColor: getStatusColor(node.status) }}>
                        {node.status}
                      </p>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>

        {/* 3. KHUNG BIỂU ĐỒ TRÒN TỶ TRỌNG TRẠNG THÁI */}
        <div className="bg-[#11151A] border border-gray-700 rounded-xl p-4 shadow-lg flex flex-col h-[500px]">
          <h3 className="text-lg font-bold text-gray-300 mb-2">🍩 Tỷ Trọng Trạng Thái</h3>
          <p className="text-xs text-gray-400 mb-4">Phân bổ tình trạng giao thông trên toàn các điểm nút</p>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={5} dataKey="value" stroke="none">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#161B22', borderColor: '#374151', color: '#fff', borderRadius: '8px' }} itemStyle={{ fontWeight: 'bold' }} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. KHU VỰC CÁC BIỂU ĐỒ PHÂN TÍCH DASHBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* DASHBOARD ĐƯỜNG: DIỄN BIẾN TỐC ĐỘ (LIVE TREND) */}
        <div className="bg-[#11151A] border border-gray-700 rounded-xl p-4 shadow-lg h-[400px] flex flex-col">
          <h3 className="text-lg font-bold text-gray-300 mb-4 flex items-center">📈 Diễn Biến Tốc Độ (Live Trend)</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="time" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                <YAxis stroke="#9CA3AF" unit=" km/h" tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: '#161B22', borderColor: '#374151', color: '#fff', borderRadius: '8px' }} />
                {topCongested.slice(0, 4).map((node, idx) => (
                  <Line key={idx} type="monotone" dataKey={node.node_name} stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                ))}
                <Legend iconType="plainline" wrapperStyle={{ paddingTop: '10px' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* DASHBOARD CỘT NGANG: TOP NÚT GIAO ÙN TẮC NHẤT */}
        <div className="bg-[#11151A] border border-gray-700 rounded-xl p-4 shadow-lg h-[400px] flex flex-col">
          <h3 className="text-lg font-bold text-gray-300 mb-4 flex items-center">🏆 Top 5 Nút Giao Ùn Tắc Nhất (%)</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCongested} layout="vertical" margin={{ top: 10, right: 30, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                <XAxis type="number" stroke="#9CA3AF" domain={[0, 100]} unit="%" />
                <YAxis dataKey="node_name" type="category" stroke="#9CA3AF" width={100} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: '#1F2937' }} contentStyle={{ backgroundColor: '#161B22', borderColor: '#374151', color: '#fff', borderRadius: '8px' }} />
                <Bar dataKey="cong_pct" name="Mức ùn tắc" radius={[0, 4, 4, 0]}>
                  {topCongested.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getStatusColor(entry.status)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* DASHBOARD CỘT ĐÔI: SO SÁNH TỐC ĐỘ THỰC TẾ & MAX */}
        <div className="bg-[#11151A] border border-gray-700 rounded-xl p-4 shadow-lg h-[400px] flex flex-col lg:col-span-2">
          <h3 className="text-lg font-bold text-gray-300 mb-4 flex items-center">⚖️ So Sánh Tốc Độ Thực Tế vs Tốc Độ Lộ Trình (Free Flow)</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trafficData.slice(0, 10)} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="node_name" stroke="#9CA3AF" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" />
                <YAxis stroke="#9CA3AF" unit=" km/h" />
                <Tooltip cursor={{ fill: '#1F2937' }} contentStyle={{ backgroundColor: '#161B22', borderColor: '#374151', color: '#fff', borderRadius: '8px' }} />
                <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '10px' }} />
                <Bar dataKey="curr_speed" name="Tốc Độ Hiện Tại" fill="#00E5FF" radius={[4, 4, 0, 0]} />
                <Bar dataKey="free_speed" name="Tốc Độ Lộ Trình (Max)" fill="#374151" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* 5. BẢNG DỮ LIỆU CHI TIẾT */}
      <div className="bg-[#11151A] border border-gray-700 rounded-xl p-4 shadow-lg mt-2">
        <h3 className="text-lg font-bold text-gray-300 mb-4 flex items-center">
          📊 Bảng Phân Tích Dữ Liệu Từng Nút Giao
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-400">
            <thead className="text-xs text-gray-300 uppercase bg-[#161B22] border-b border-gray-700">
              <tr>
                <th className="px-4 py-3">Nút Giao</th>
                <th className="px-4 py-3">Khu Vực</th>
                <th className="px-4 py-3 text-center">Tốc Độ Hiện Tại</th>
                <th className="px-4 py-3 text-center">Tốc Độ Max</th>
                <th className="px-4 py-3 text-center">Mức Ùn Tắc</th>
                <th className="px-4 py-3">Trạng Thái</th>
              </tr>
            </thead>
            <tbody>
              {trafficData.length === 0 ? (
                <tr><td colSpan="6" className="px-4 py-4 text-center">Đang tải dữ liệu thực tế từ API TomTom...</td></tr>
              ) : (
                trafficData.map((row, idx) => (
                  <tr key={idx} className="bg-[#0A0D10] border-b border-gray-800 hover:bg-[#161B22] transition-colors">
                    <td className="px-4 py-3 font-bold text-gray-200">{row.node_name}</td>
                    <td className="px-4 py-3">{row.district}</td>
                    <td className="px-4 py-3 text-center font-bold text-[#00E5FF]">{row.curr_speed} km/h</td>
                    <td className="px-4 py-3 text-center">{row.free_speed} km/h</td>
                    <td className="px-4 py-3 text-center font-bold">{row.cong_pct}%</td>
                    <td className="px-4 py-3 font-bold" style={{ color: getStatusColor(row.status) }}>
                      {row.status}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default TomtomTab;
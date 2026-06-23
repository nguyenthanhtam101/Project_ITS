import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  AreaChart, Area, PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, 
  XAxis, YAxis, CartesianGrid 
} from 'recharts';

const AnalyticsTab = () => {
  // Trạng thái bộ lọc
  const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [cameras, setCameras] = useState(["Tất cả các trạm"]);
  const [selectedCam, setSelectedCam] = useState("Tất cả các trạm");
  
  // Trạng thái dữ liệu
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState(null);
  
  // Trạng thái mục bằng chứng vi phạm
  const [selectedEvidenceIdx, setSelectedEvidenceIdx] = useState(0);

  // Lấy danh sách Camera từ DB khi mở trang
  useEffect(() => {
    axios.get('https://bruce-racial-bureau-stopped.trycloudflare.com/api/cameras')
      .then(res => setCameras(res.data))
      .catch(() => setCameras(["Tất cả các trạm"]));
  }, []);

  const handleFetchData = async () => {
    setIsLoading(true);
    try {
      const res = await axios.post('https://bruce-racial-bureau-stopped.trycloudflare.com/api/analytics', {
        start_date: startDate,
        end_date: endDate,
        camera: selectedCam
      });
      if (res.data.status === 'success') {
        setData(res.data);
        setSelectedEvidenceIdx(0);
      } else if (res.data.status === 'empty') {
        alert('⚠️ Không có dữ liệu trong khoảng thời gian này.');
        setData(null);
      } else {
        alert('❌ Lỗi truy vấn Database: ' + res.data.message);
      }
    } catch (e) {
      alert('❌ Mất kết nối đến Backend!');
    } finally {
      setIsLoading(false);
    }
  };

  const PIE_COLORS = ['#00E5FF', '#FF00FF', '#00FF00', '#FFA500', '#FFFF00'];
  const VIOL_COLORS = ['#FF4B4B', '#FF9800', '#FF1493'];

  // Hàm trigger tải file từ Backend
  const handleExportFile = async (formatType) => {
    try {
      const response = await axios.post(`https://bruce-racial-bureau-stopped.trycloudflare.com/api/analytics/export/${formatType}`, {
        start_date: startDate,
        end_date: endDate,
        camera: selectedCam
      }, { responseType: 'blob' }); // Định dạng nhận dữ liệu nhị phân (file)
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const filename = formatType === 'excel' 
        ? `Bao_Cao_ITS_${startDate}_den_${endDate}.xlsx` 
        : `Raw_Data_${startDate}_den_${endDate}.csv`;
        
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      alert('❌ Lỗi khi xuất tệp báo cáo!');
    }
  };


  return (
    <div className="flex flex-col gap-6 mt-4 pb-10">
      
      {/* 1. BỘ LỌC TÌM KIẾM */}
      <div className="bg-[#11151A] border border-gray-700 rounded-xl p-5 shadow-lg">
        <h3 className="text-xl font-bold text-[#00E5FF] mb-4 border-b border-gray-700 pb-2">🔍 Bộ Lọc Trích Xuất Dữ Liệu SQL</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-gray-400 text-sm mb-2">📅 Từ ngày:</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-[#0A0D10] text-white border border-gray-600 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">📅 Đến ngày:</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-[#0A0D10] text-white border border-gray-600 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">📍 Chọn trạm Camera:</label>
            <select value={selectedCam} onChange={(e) => setSelectedCam(e.target.value)} className="w-full bg-[#0A0D10] text-white border border-gray-600 rounded-lg px-3 py-2">
              {cameras.map(cam => <option key={cam} value={cam}>{cam}</option>)}
            </select>
          </div>
          <button 
            onClick={handleFetchData} disabled={isLoading}
            className={`w-full py-2 font-bold rounded-lg transition-all ${isLoading ? 'bg-gray-700 text-gray-500' : 'bg-[#00E5FF] text-gray-900 hover:bg-[#00b2cc] shadow-[0_0_10px_rgba(0,229,255,0.4)]'}`}
          >
            {isLoading ? '⏳ ĐANG TRUY VẤN...' : '🔄 TRÍCH XUẤT DỮ LIỆU'}
          </button>
        </div>
      </div>

      {data && (
        <>
          {/* 2. KHUNG KPI THỐNG KÊ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#161B22] border border-gray-700 rounded-xl p-6 flex flex-col items-center justify-center">
              <p className="text-gray-400 font-bold uppercase mb-2">Tổng Lưu Lượng Xe</p>
              <p className="text-6xl font-extrabold text-[#00E5FF]">{data.kpi.total_vehicles}</p>
            </div>
            <div className="bg-[#161B22] border border-gray-700 rounded-xl p-6 flex flex-col items-center justify-center">
              <p className="text-gray-400 font-bold uppercase mb-2">Tổng Lỗi Vi Phạm</p>
              <p className={`text-6xl font-extrabold ${data.kpi.total_violations > 0 ? 'text-red-500' : 'text-green-500'}`}>
                {data.kpi.total_violations}
              </p>
            </div>
            <div className="bg-[#161B22] border border-gray-700 rounded-xl p-6 flex flex-col items-center justify-center relative overflow-hidden">
              <p className="text-gray-400 font-bold uppercase mb-2">Tốc Độ TB Mạng Lưới</p>
              <p className="text-6xl font-extrabold text-yellow-400">{data.kpi.avg_speed} <span className="text-2xl text-gray-500">km/h</span></p>
              {data.kpi.avg_speed === 0 && <p className="absolute bottom-2 text-xs text-gray-500 italic">Tính năng tốc độ chưa kích hoạt ở trạm này</p>}
            </div>
          </div>

          {/* 3. TRA CỨU ẢNH PHẠT NGUỘI */}
          {data.evidence_list.length > 0 && (
            <div className="bg-[#11151A] border border-gray-700 rounded-xl p-5 shadow-lg">
              <h3 className="text-lg font-bold text-[#FF4B4B] mb-4 flex items-center">📸 Trích Xuất Bằng Chứng Phạt Nguội</h3>
              
              <select 
                value={selectedEvidenceIdx} 
                onChange={(e) => setSelectedEvidenceIdx(Number(e.target.value))}
                className="w-full bg-[#0A0D10] text-gray-300 border border-gray-600 rounded-lg px-3 py-2 mb-6 focus:border-[#FF4B4B] outline-none"
              >
                {data.evidence_list.map((ev, idx) => (
                  <option key={idx} value={idx}>
                    🕒 {ev['Thời Gian_str']} | Lỗi: {ev['Trạng Thái']} | Xe: {ev['Loại Phương Tiện']} | BS: {ev['Biển Số']}
                  </option>
                ))}
              </select>

              <div className="flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-1/3 bg-[rgba(255,75,75,0.05)] border border-[#FF4B4B] rounded-lg p-5">
                  <h4 className="text-[#FF4B4B] font-bold border-b border-[rgba(255,75,75,0.3)] pb-2 mb-4">THÔNG TIN VI PHẠM</h4>
                  <div className="space-y-3 text-gray-300 text-sm">
                    <p>📍 <b>Vị trí:</b> {data.evidence_list[selectedEvidenceIdx]['Camera']}</p>
                    <p>🕒 <b>Thời gian:</b> {data.evidence_list[selectedEvidenceIdx]['Thời Gian_str']}</p>
                    <p>🚗 <b>Loại xe:</b> {data.evidence_list[selectedEvidenceIdx]['Loại Phương Tiện']}</p>
                    <p>🏷️ <b>Biển số:</b> <span className="text-[#00E5FF] font-bold">{data.evidence_list[selectedEvidenceIdx]['Biển Số']}</span></p>
                    <p>⚡ <b>Tốc độ:</b> <span className="text-yellow-400 font-bold">{data.evidence_list[selectedEvidenceIdx]['Tốc Độ (km/h)']} km/h</span></p>
                    <p>🚨 <b>Hành vi:</b> <span className="bg-red-500 text-white px-2 py-0.5 rounded font-bold">{data.evidence_list[selectedEvidenceIdx]['Trạng Thái']}</span></p>
                    <p className="text-xs text-gray-500 pt-2 border-t border-gray-700">ID: {data.evidence_list[selectedEvidenceIdx]['ID Xe']}</p>
                  </div>
                </div>
                <div className="w-full md:w-2/3 bg-black border border-gray-700 rounded-lg flex items-center justify-center overflow-hidden min-h-[300px]">
                  {/* Trỏ link lấy ảnh trực tiếp từ backend FastAPI */}
                  <img 
                    src={`https://bruce-racial-bureau-stopped.trycloudflare.com/evidence/violation_${data.evidence_list[selectedEvidenceIdx]['ID Xe']}.jpg`} 
                    alt="Bằng chứng vi phạm" 
                    className="max-w-full max-h-[400px] object-contain"
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                  />
                  <div className="hidden text-center text-gray-500">
                    <span className="text-5xl block mb-2">📷</span>
                    <p>Hệ thống ghi nhận sự kiện<br/>Nhưng AI chưa lưu kịp ảnh bằng chứng.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. CÁC BIỂU ĐỒ PHÂN TÍCH */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#11151A] border border-gray-700 rounded-xl p-5 shadow-lg h-[400px] flex flex-col lg:col-span-2">
              <h3 className="text-lg font-bold text-gray-300 mb-4">📈 Diễn Biến Lưu Lượng Xe (Theo Phút)</h3>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trend_data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                    <XAxis dataKey="Giờ_Phút" stroke="#9CA3AF" />
                    <YAxis stroke="#9CA3AF" />
                    <Tooltip contentStyle={{ backgroundColor: '#161B22', borderColor: '#374151', color: '#fff' }} />
                    <Area type="monotone" dataKey="Số Xe" stroke="#00E5FF" fill="rgba(0, 229, 255, 0.2)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-[#11151A] border border-gray-700 rounded-xl p-5 shadow-lg h-[400px] flex flex-col">
              <h3 className="text-lg font-bold text-gray-300 mb-4">🍩 Cơ Cấu Phương Tiện</h3>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.type_data} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={5} dataKey="Số Lượng" nameKey="Loại Xe">
                      {data.type_data.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#161B22', borderColor: '#374151', color: '#fff' }} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-[#11151A] border border-gray-700 rounded-xl p-5 shadow-lg h-[400px] flex flex-col">
              <h3 className="text-lg font-bold text-gray-300 mb-4">🚨 Phân Tích Lỗi Vi Phạm</h3>
              <div className="flex-1 min-h-0">
                {data.viol_type_data.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.viol_type_data} cx="50%" cy="50%" outerRadius={110} dataKey="Số Lượng" nameKey="Loại Lỗi">
                        {data.viol_type_data.map((entry, index) => <Cell key={`cell-${index}`} fill={VIOL_COLORS[index % VIOL_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#161B22', borderColor: '#374151', color: '#fff' }} />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-green-500 font-bold">✅ Không phát hiện vi phạm nào!</div>
                )}
              </div>
            </div>
          </div>

          {/* 5. BẢNG DỮ LIỆU THÔ */}
          <div className="bg-[#11151A] border border-gray-700 rounded-xl p-5 shadow-lg">
            <h3 className="text-lg font-bold text-gray-300 mb-4">📋 Bảng Dữ Liệu Thô (SQL)</h3>
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-300 uppercase bg-[#161B22] sticky top-0 border-b border-gray-700 shadow">
                  <tr>
                    <th className="px-4 py-3">Thời Gian</th>
                    <th className="px-4 py-3">ID Xe</th>
                    <th className="px-4 py-3">Loại Xe</th>
                    <th className="px-4 py-3">Biển Số</th>
                    <th className="px-4 py-3">Tốc Độ</th>
                    <th className="px-4 py-3">Trạng Thái</th>
                    <th className="px-4 py-3">Camera</th>
                  </tr>
                </thead>
                <tbody>
                  {data.raw_data.map((row, idx) => {
                    const isViol = !['Bình Thường', 'Normal', 'Low', 'Thông Thoáng', 'Lưu thông Tự do'].includes(row['Trạng Thái']);
                    return (
                      <tr key={idx} className="bg-[#0A0D10] border-b border-gray-800 hover:bg-[#161B22] transition-colors">
                        <td className="px-4 py-2">{row['Thời Gian_str']}</td>
                        <td className="px-4 py-2">{row['ID Xe']}</td>
                        <td className="px-4 py-2">{row['Loại Phương Tiện']}</td>
                        <td className="px-4 py-2 font-bold text-[#00E5FF]">{row['Biển Số']}</td>
                        <td className="px-4 py-2">{row['Tốc Độ (km/h)']}</td>
                        <td className={`px-4 py-2 font-bold ${isViol ? 'text-red-500' : 'text-gray-400'}`}>{row['Trạng Thái']}</td>
                        <td className="px-4 py-2">{row['Camera']}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {/* CẬP NHẬT MỚI: KHUNG XUẤT BÁO CÁO DỮ LIỆU (EXPORT REPORT) */}
          <div className="bg-[#11151A] border border-gray-700 rounded-xl p-5 shadow-lg mt-6">
            <h4 className="text-lg font-bold text-gray-300 mb-2">📥 Xuất Báo Cáo Dữ Liệu (Export Report)</h4>
            <div className="bg-[#161B22] border border-blue-900 rounded-lg p-3 text-xs text-blue-400 mb-4">
              💡 <b>MẸO XUẤT FILE PDF:</b> Để lưu toàn bộ cấu trúc các biểu đồ phân tích trực quan cực nét phía trên ra file PDF báo cáo, bạn hãy ấn tổ hợp phím <b>Ctrl + P</b> trên trình duyệt và chọn mục <b>Lưu dưới dạng PDF</b>.
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => handleExportFile('excel')}
                className="w-full bg-[#161B22] border border-green-600 text-green-400 hover:bg-green-600 hover:text-gray-900 font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                📊 TẢI BÁO CÁO EXCEL (.XLSX)
              </button>
              <button
                onClick={() => handleExportFile('csv')}
                className="w-full bg-[#161B22] border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                📄 TẢI DỮ LIỆU THÔ (.CSV)
              </button>
            </div>
          </div>
        </>
      )}
    </div>
    
  );
};

export default AnalyticsTab;
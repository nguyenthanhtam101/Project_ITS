import { useState, useEffect } from 'react';
import axios from 'axios';

// Component Bảng chỉnh sửa dữ liệu
const EditableTable = ({ tableName, title, subtitle, setHasUnsavedChanges }) => {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [tableName]);

  const fetchData = async () => {
    try {
      const res = await axios.get(`https://lean-capacity-aruba-forbes.trycloudflare.com/api/admin/table/${tableName}`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      if (res.data && res.data.length > 0) {
        setData(res.data);
        setColumns(Object.keys(res.data[0]));
      } else {
        // Cập nhật cấu trúc dự phòng thêm cột district
        if (tableName === 'cameras') setColumns(['id', 'name', 'country', 'lat', 'lon', 'status', 'stream_url']);
        else if (tableName === 'tomtom_intersections') setColumns(['name', 'district', 'lat', 'lon']);
        else if (tableName === 'traffic_events') setColumns(['id', 'timestamp', 'vehicle_type', 'speed', 'plate_text', 'status']);
      }
    } catch (e) { console.error("Lỗi lấy dữ liệu:", e); }
  };

  const handleCellChange = (rowIndex, colName, value) => {
    const newData = [...data];
    newData[rowIndex][colName] = value;
    setData(newData);
    setHasUnsavedChanges(true);
  };

  const handleAddRow = () => {
    const newRow = {};
    const nextId = data.length > 0 ? Math.max(...data.map(d => Number(d.id) || 0)) + 1 : 1;
    
    columns.forEach(col => {
      if (col === 'id') newRow[col] = nextId;
      else if (col === 'status') newRow[col] = 'Active';
      else newRow[col] = '';
    });
    setData([...data, newRow]); 
    setHasUnsavedChanges(true);
  };

  const handleDeleteRow = (index) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa dòng này khỏi Database không?')) {
      const newData = data.filter((_, i) => i !== index);
      setData(newData);
      setHasUnsavedChanges(true);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await axios.post(`https://lean-capacity-aruba-forbes.trycloudflare.com/api/admin/table/${tableName}/sync`, data, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      if (res.data.status === 'success') {
        alert('✅ Đã đồng bộ dữ liệu lên Database PostgreSQL!');
        setHasUnsavedChanges(false);
        fetchData();
      } else alert('❌ Lỗi lưu dữ liệu: ' + res.data.message);
    } catch (e) { alert('❌ Mất kết nối đến server!'); }
    setIsSaving(false);
  };

  return (
    <div className="bg-[#11151A] border border-gray-700 rounded-xl p-5 shadow-lg mt-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h4 className="text-lg font-bold text-gray-300">{title}</h4>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
        <div className="flex gap-3">
          {tableName !== 'traffic_events' && (
            <button onClick={handleAddRow} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition-all">
              ➕ THÊM MỚI
            </button>
          )}
          <button onClick={handleSave} disabled={isSaving} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded-lg transition-all shadow-[0_0_10px_rgba(34,197,94,0.3)]">
            {isSaving ? '⏳ ĐANG LƯU...' : '💾 LƯU THAY ĐỔI LÊN DATABASE'}
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto max-h-[500px] border border-gray-700 rounded-lg mt-4">
        <table className="w-full text-sm text-left text-gray-300">
          <thead className="text-xs uppercase bg-[#161B22] sticky top-0 border-b border-gray-700">
            <tr>
              <th className="px-4 py-3 w-10 text-center border-r border-gray-700">XÓA</th>
              {/* Thêm cột STT Cố định */}
              <th className="px-4 py-3 w-12 text-center border-r border-gray-700 text-[#00E5FF]">STT</th>
              
              {columns.map(col => (
                <th key={col} className="px-4 py-3 border-r border-gray-700">
                  {col === 'district' ? 'QUẬN' : col.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={columns.length + 2} className="text-center py-10 text-gray-500">Bảng đang trống. Bấm "THÊM MỚI" để bắt đầu.</td></tr>
            ) : (
              data.map((row, rIdx) => (
                <tr key={rIdx} className="bg-[#0A0D10] border-b border-gray-800 hover:bg-[#161B22]">
                  <td className="px-2 py-2 border-r border-gray-800 text-center">
                    <button onClick={() => handleDeleteRow(rIdx)} className="text-red-500 hover:bg-red-500 hover:text-white font-bold px-3 py-1 rounded transition-all">✕</button>
                  </td>
                  
                  {/* Cột dữ liệu STT tự động đếm dòng */}
                  <td className="px-2 py-2 border-r border-gray-800 text-center font-bold text-gray-500">
                    {rIdx + 1}
                  </td>
                  
                  {columns.map(col => {
                    let displayValue = row[col] !== null && row[col] !== undefined ? row[col] : '';

                    if (col === 'id' && displayValue !== '') {
                      displayValue = String(displayValue).padStart(3, '0');
                    }
                    if (tableName === 'traffic_events' && col === 'speed') {
                      if (displayValue === '' || Number(displayValue) === 0) displayValue = 'Không có';
                    }

                    return (
                      <td key={col} className="px-0 py-0 border-r border-gray-800">
                        {tableName === 'cameras' && col === 'status' ? (
                          <select 
                            value={displayValue || 'Active'} 
                            onChange={(e) => handleCellChange(rIdx, col, e.target.value)}
                            className="w-full bg-transparent text-white px-4 py-3 outline-none focus:bg-[#1A202C] cursor-pointer font-bold"
                          >
                            <option value="Active">🟢 Active</option>
                            <option value="Connecting">🟠 Connecting</option>
                            <option value="Disconnected">🔴 Disconnected</option>
                          </select>
                        ) : (
                          <input 
                            type="text" 
                            value={displayValue} 
                            onChange={(e) => handleCellChange(rIdx, col, e.target.value)}
                            className={`w-full bg-transparent text-white px-4 py-3 outline-none focus:bg-[#1A202C] ${col === 'id' ? 'text-[#00E5FF] font-bold text-center' : ''}`}
                            placeholder={tableName === 'traffic_events' ? '' : `Nhập ${col}...`}
                            readOnly={col === 'id' || tableName === 'traffic_events'} 
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AdminTab = () => {
  const [activeTab, setActiveTab] = useState('cameras');
  const [users, setUsers] = useState([]);
  const [selectedUserToDelete, setSelectedUserToDelete] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
  }, [activeTab]);

  const handleTabSwitch = (tabId) => {
    if (hasUnsavedChanges) {
        const confirmLeave = window.confirm("⚠️ BẠN CÓ THAO TÁC CHƯA LƯU!\n\nBạn có chắc chắn muốn rời đi và HỦY bỏ toàn bộ các thay đổi vừa nhập không?");
        if (confirmLeave) {
            setHasUnsavedChanges(false);
            setActiveTab(tabId);
        }
    } else {
        setActiveTab(tabId);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await axios.get('https://lean-capacity-aruba-forbes.trycloudflare.com/api/admin/users', {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      setUsers(res.data);
      if (res.data.length > 0) setSelectedUserToDelete(res.data[0].username);
    } catch (e) { console.error(e); }
  };

  const handleDeleteUser = async () => {
    if (selectedUserToDelete === 'admin') return alert('⚠️ Không thể xóa tài khoản Super Admin!');
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn user: ${selectedUserToDelete}?`)) return;
    try {
      const res = await axios.delete(`https://lean-capacity-aruba-forbes.trycloudflare.com/api/admin/users/${selectedUserToDelete}`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      if (res.data.status === 'success') {
        alert('✅ Đã xóa tài khoản thành công!');
        fetchUsers();
      } else alert('❌ ' + res.data.message);
    } catch (e) { alert('❌ Lỗi kết nối server!'); }
  };

  return (
    <div className="flex flex-col mt-4 pb-10">
      <div className="bg-[#11151A] border border-gray-700 rounded-xl p-5 shadow-lg mb-6">
        <h3 className="text-2xl font-bold text-[#00E5FF] mb-2">⚙️ TRUNG TÂM QUẢN TRỊ HỆ THỐNG (ADMIN DASHBOARD)</h3>
        <p className="text-gray-400 bg-blue-900/20 border border-blue-800 p-3 rounded-lg text-sm">
          💡 Tính năng tương tác trực tiếp với Database. Bấm [LƯU THAY ĐỔI LÊN DATABASE] để đồng bộ thẳng vào PostgreSQL.
        </p>
      </div>

      <div className="flex space-x-2 border-b border-gray-700 mb-2">
        {[{ id: 'users', label: '👥 Quản lý Người dùng' }, { id: 'cameras', label: '🎥 Quản lý Camera' }, { id: 'events', label: '🚗 Dữ liệu Giao thông' }, { id: 'tomtom', label: '🌍 Nút giao (API TomTom)' }].map(tab => (
          <button 
            key={tab.id} 
            onClick={() => handleTabSwitch(tab.id)} 
            className={`px-6 py-3 font-bold text-sm rounded-t-lg transition-all ${activeTab === tab.id ? 'bg-[#161B22] text-[#00E5FF] border-t-2 border-l border-r border-[#00E5FF]' : 'text-gray-500 hover:text-white'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && (
        <div className="bg-[#11151A] border border-gray-700 rounded-xl p-5 shadow-lg mt-4">
          <h4 className="text-lg font-bold text-gray-300 mb-4">Bảng Dữ Liệu Tài Khoản</h4>
          <table className="w-full text-sm text-left text-gray-300 mb-8">
            <thead className="text-xs uppercase bg-[#161B22] border-b border-gray-700">
              <tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Tài Khoản</th><th className="px-4 py-3">Họ và Tên</th><th className="px-4 py-3">Ngày Tạo</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="bg-[#0A0D10] border-b border-gray-800">
                  <td className="px-4 py-3">{String(u.id).padStart(3, '0')}</td>
                  <td className="px-4 py-3 font-bold text-[#00E5FF]">{u.username}</td>
                  <td className="px-4 py-3">{u.full_name}</td>
                  <td className="px-4 py-3">{u.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 className="text-lg font-bold text-red-400 mb-2 border-t border-gray-700 pt-6">🗑️ Xóa Tài Khoản Vi Phạm</h4>
          <div className="flex gap-4 items-end">
            <div className="w-64">
              <label className="block text-gray-400 text-sm mb-1">Chọn tài khoản cần xóa:</label>
              <select value={selectedUserToDelete} onChange={(e) => setSelectedUserToDelete(e.target.value)} className="w-full bg-[#0A0D10] text-white border border-gray-600 rounded px-3 py-2 outline-none">
                {users.map(u => <option key={u.username} value={u.username}>{u.username}</option>)}
              </select>
            </div>
            <button onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-6 rounded transition-all">
              XÓA TÀI KHOẢN NÀY
            </button>
          </div>
        </div>
      )}

      {activeTab === 'cameras' && <EditableTable tableName="cameras" title="Danh Sách Trạm Camera Giao Thông" subtitle="Quản lý Trạng thái, Tọa độ bản đồ và Link của các Camera." setHasUnsavedChanges={setHasUnsavedChanges} />}
      {activeTab === 'events' && <EditableTable tableName="traffic_events" title="Dữ Liệu Sự Kiện Giao Thông" subtitle="Dữ liệu do AI tự động thu thập. Không cho phép tự ý thêm mới." setHasUnsavedChanges={setHasUnsavedChanges} />}
      {activeTab === 'tomtom' && <EditableTable tableName="tomtom_intersections" title="Danh Sách Nút Giao Giám Sát" subtitle="Nhập tọa độ (Vĩ độ - lat, Kinh độ - lon) để hệ thống tự động gọi API TomTom." setHasUnsavedChanges={setHasUnsavedChanges} />}
    </div>
  );
};

export default AdminTab;
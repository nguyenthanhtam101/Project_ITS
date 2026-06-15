import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import MonitorTab from './pages/MonitorTab'; 
import TomtomTab from './pages/TomtomTab'; 
import AnalyticsTab from './pages/AnalyticsTab';
import AdminTab from './pages/AdminTab'; // BỔ SUNG 1: Import trang Admin
import L from 'leaflet';

// Sửa lỗi mất icon mặc định của Leaflet (Áp dụng toàn cục)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// ==========================================
// 1. GIAO DIỆN ĐĂNG NHẬP / ĐĂNG KÝ (AUTH PAGE)
// ==========================================
const AuthPage = ({ onLoginSuccess }) => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [formData, setFormData] = useState({ username: '', password: '', full_name: '' });
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // STATE MỚI: Bật/Tắt xem mật khẩu
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);
    const endpoint = isLoginMode ? '/api/login' : '/api/register';
    
    try {
      const res = await axios.post(`https://stealable-ayesha-magnesian.ngrok-free.dev${endpoint}`, formData);
      if (res.data.status === 'success') {
        if (isLoginMode) {
          onLoginSuccess(res.data.full_name);
        } else {
          alert(res.data.message);
          setIsLoginMode(true); 
          setFormData({ username: '', password: '', full_name: '' }); 
        }
      } else {
        setErrorMsg(res.data.message);
      }
    } catch (err) {
      setErrorMsg("❌ Không thể kết nối đến Máy chủ Backend!");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E1117] flex items-center justify-center p-4">
      <div className="bg-[#11151A] border border-gray-700 rounded-xl shadow-[0_0_30px_rgba(0,229,255,0.15)] p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-[#00E5FF] drop-shadow-[0_0_10px_rgba(0,229,255,0.5)] mb-2">ITS TP.HCM</h1>
          <p className="text-gray-400">Trung Tâm Điều Hành Giao Thông</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {errorMsg && <div className="bg-red-900/50 border border-red-500 text-red-200 text-sm p-3 rounded text-center font-bold">{errorMsg}</div>}
          
          {!isLoginMode && (
            <div>
              <label className="block text-gray-400 text-sm mb-1 font-bold">Họ và Tên</label>
              <input type="text" required value={formData.full_name} onChange={(e) => setFormData({...formData, full_name: e.target.value})} className="w-full bg-[#161B22] border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#00E5FF] transition-colors" placeholder="VD: Nguyễn Văn A" />
            </div>
          )}
          
          <div>
            <label className="block text-gray-400 text-sm mb-1 font-bold">Tên Đăng Nhập</label>
            <input type="text" required value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} className="w-full bg-[#161B22] border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#00E5FF] transition-colors" placeholder="Nhập tài khoản..." />
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1 font-bold">Mật Khẩu</label>
            <div className="relative">
              <input 
                // ĐÃ FIX: Đổi type dựa trên state showPassword
                type={showPassword ? "text" : "password"} 
                required 
                value={formData.password} 
                onChange={(e) => setFormData({...formData, password: e.target.value})} 
                className="w-full bg-[#161B22] border border-gray-700 text-white rounded-lg px-4 py-3 pr-12 focus:outline-none focus:border-[#00E5FF] transition-colors" 
                placeholder="••••••••" 
              />
              {/* NÚT CON MẮT */}
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-[#00E5FF] transition-colors"
                title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isLoading} className={`w-full font-bold py-3 mt-4 rounded-lg transition-all ${isLoading ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-[#00E5FF] hover:bg-[#00b2cc] text-gray-900 shadow-[0_0_15px_rgba(0,229,255,0.4)]'}`}>
            {isLoading ? '⏳ ĐANG ĐĂNG NHẬP...' : (isLoginMode ? 'ĐĂNG NHẬP HỆ THỐNG' : 'ĐĂNG KÝ TÀI KHOẢN')}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-500">
          {isLoginMode ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
          <button onClick={() => { setIsLoginMode(!isLoginMode); setErrorMsg(''); }} className="text-[#00E5FF] hover:underline font-bold transition-colors">
            {isLoginMode ? "Đăng ký ngay" : "Đăng nhập"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. THANH MENU 
// ==========================================
const NavigationTabs = ({ currentUser, onLogout }) => {
  const location = useLocation();
  const tabs = [
    { path: '/', label: '🎥 Giám Sát Trực Tiếp' },
    { path: '/map', label: '🌍 Giám Sát Nút Giao' },
    { path: '/analytics', label: '📊 Phân Tích Dữ Liệu' },
  ];

  if (currentUser === 'Super Admin') {
    tabs.push({ path: '/admin', label: '⚙️ Admin' });
  }

  return (
    <div className="flex flex-col md:flex-row justify-between items-end md:items-center border-b border-gray-700 px-6 pt-4">
      <div className="flex space-x-2">
        {tabs.map((tab) => (
          <Link
            key={tab.path}
            to={tab.path}
            className={`px-6 py-3 font-bold text-lg rounded-t-lg transition-all ${
              location.pathname === tab.path
                ? 'bg-[#11151A] text-[#00E5FF] border-t-2 border-l-2 border-r-2 border-[#00E5FF]'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      
      <div className="flex items-center gap-4 pb-2">
        <span className="text-gray-300 text-sm">
          Xin chào, <b className="text-[#00E5FF]">{currentUser}</b>!
        </span>
        <button 
          onClick={onLogout} 
          className="bg-transparent border border-red-500 text-red-500 hover:bg-red-500 hover:text-white font-bold py-1.5 px-4 rounded transition-all text-sm"
        >
          ĐĂNG XUẤT
        </button>
      </div>
    </div>
  );
};

// ==========================================
// 3. CẤU TRÚC APP CHÍNH
// ==========================================
function App() {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('its_hcm_user');
    if (savedUser) {
      setCurrentUser(savedUser); 
    }
  }, []);

  const handleLoginSuccess = (fullName) => {
    setCurrentUser(fullName);
    localStorage.setItem('its_hcm_user', fullName);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('its_hcm_user');
  };

  if (!currentUser) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-[#0E1117] text-white font-sans pb-10">
        <header className="pt-8 pb-4">
          <h1 className="text-3xl font-extrabold text-center text-cyan-400 drop-shadow-[0_0_10px_rgba(0,229,255,0.5)]">
            🚦 TRUNG TÂM ĐIỀU HÀNH ITS TP.HCM
          </h1>
          <p className="text-center text-gray-400 mt-2 text-lg">
            Hệ thống Giám sát & Quản lý Giao thông Thông minh
          </p>
        </header>

        <NavigationTabs currentUser={currentUser} onLogout={handleLogout} />

        <main className="px-6">
          <Routes>
            <Route path="/" element={<MonitorTab />} />
            <Route path="/map" element={<TomtomTab />} />
            <Route path="/analytics" element={<AnalyticsTab />} />
            {/* BỔ SUNG 3: Thêm Route bảo mật cho trang Admin */}
            <Route path="/admin" element={currentUser === 'Super Admin' ? <AdminTab /> : <div className="p-10 text-center text-red-500 font-bold">⛔ Bạn không có quyền truy cập trang này.</div>} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
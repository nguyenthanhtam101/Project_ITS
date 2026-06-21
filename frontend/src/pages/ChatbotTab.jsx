import { useState } from 'react';
import axios from 'axios';

const ChatbotWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { text: "Chào bạn! Tôi là Trợ lý Giao thông ITS. Bạn muốn kiểm tra tình trạng kẹt xe ở khu vực nào?", isBot: true }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;
    
    const newMessages = [...messages, { text: input, isBot: false }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await axios.post('http://localhost:8000/api/chat', { message: input });
      if (res.data.status === 'success') {
        setMessages([...newMessages, { text: res.data.reply, isBot: true }]);
      } else {
        setMessages([...newMessages, { text: "❌ Xin lỗi, não bộ AI đang bảo trì: " + res.data.message, isBot: true }]);
      }
    } catch (error) {
      setMessages([...newMessages, { text: "❌ Mất kết nối đến Máy chủ AI.", isBot: true }]);
    }
    setIsLoading(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
      
      {/* 1. KHUNG CHAT (Chỉ hiện ra khi biến isOpen là true) */}
      {isOpen && (
        <div className="mb-4 w-[350px] sm:w-[400px] h-[500px] bg-[#11151A] border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
          
          {/* Header của Popup */}
          <div className="bg-[#161B22] p-4 border-b border-gray-700 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🤖</div>
              <div>
                <h3 className="text-md font-bold text-[#00E5FF]">ITS AI Assistant</h3>
                <p className="text-[11px] text-gray-400">Trợ lý phân tích luồng giao thông</p>
              </div>
            </div>
            {/* Nút Tắt (X) */}
            <button 
              onClick={() => setIsOpen(false)} 
              className="text-gray-400 hover:text-red-500 font-bold text-xl px-2 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Nội dung tin nhắn */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.isBot ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] p-3 rounded-xl text-sm leading-relaxed ${
                  msg.isBot 
                    ? 'bg-[#1E293B] text-gray-200 rounded-tl-none border border-gray-700' 
                    : 'bg-[#00E5FF] text-gray-900 rounded-tr-none font-bold shadow-[0_0_10px_rgba(0,229,255,0.3)]'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-[#1E293B] text-gray-400 p-3 rounded-xl rounded-tl-none text-sm animate-pulse border border-gray-700">
                  Đang phân tích dữ liệu...
                </div>
              </div>
            )}
          </div>

          {/* Ô nhập liệu */}
          <div className="p-3 bg-[#0A0D10] border-t border-gray-800 flex gap-2">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Nhập câu hỏi tại đây..."
              className="flex-1 bg-[#161B22] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-[#00E5FF] transition-colors"
            />
            <button 
              onClick={sendMessage}
              disabled={isLoading}
              className="bg-[#00E5FF] hover:bg-[#00b2cc] text-gray-900 font-bold px-4 py-2 rounded-lg transition-all disabled:opacity-50"
            >
              GỬI
            </button>
          </div>
        </div>
      )}

      {/* 2. NÚT BONG BÓNG NỔI (Luôn hiện khi khung chat đang đóng) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-[#00E5FF] hover:bg-[#00b2cc] text-gray-900 w-14 h-14 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(0,229,255,0.5)] transition-transform hover:scale-110 border-2 border-transparent hover:border-white"
        >
          <span className="text-3xl">🤖</span>
        </button>
      )}
    </div>
  );
};

export default ChatbotWidget;
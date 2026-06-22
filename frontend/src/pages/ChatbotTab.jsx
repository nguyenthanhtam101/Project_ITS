import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const ChatbotWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { text: "Chào bạn! Tôi là Trợ lý Giao thông ITS. Bạn muốn kiểm tra tình trạng kẹt xe hay thời tiết ở khu vực nào?", isBot: true }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  // 1. TẠO REF TRỰC TIẾP VÀO KHUNG CHAT ĐỂ ÉP CUỘN
  const chatContainerRef = useRef(null);

  // 2. HÀM ÉP CUỘN (Chạy mỗi khi có tin nhắn mới)
  useEffect(() => {
    if (chatContainerRef.current) {
      // Ép thanh cuộn chạy xuống bằng tổng chiều cao của khung chữ
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

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
        setMessages([...newMessages, { text: "❌ Lỗi: " + res.data.message, isBot: true }]);
      }
    } catch (error) {
      setMessages([...newMessages, { text: "❌ Mất kết nối đến Máy chủ AI.", isBot: true }]);
    }
    setIsLoading(false);
  };

  // 3. HÀM CHẶT DÒNG CỰC MẠNH: Biến mọi dấu \n thành thẻ <div> riêng biệt
  const formatMessage = (text) => {
    return text.split('\n').map((line, index) => {
      // Bỏ qua các dòng trống vô nghĩa
      if (line.trim() === '') return <div key={index} className="h-1"></div>;
      
      const parts = line.split(/(\*\*.*?\*\*)/g);
      return (
        <div key={index} className="mb-2 last:mb-0">
          {parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="text-[#00E5FF] font-extrabold">{part.slice(2, -2)}</strong>;
            }
            return <span key={i}>{part}</span>;
          })}
        </div>
      );
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
      
      {isOpen && (
        <div className="mb-4 w-[350px] sm:w-[420px] h-[550px] bg-[#11151A] border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
          
          <div className="bg-[#161B22] p-4 border-b border-gray-700 flex justify-between items-center shadow-md z-10">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🤖</div>
              <div>
                <h3 className="text-md font-bold text-[#00E5FF]">ITS AI Assistant</h3>
                <p className="text-[11px] text-gray-400">Tích hợp Giao thông & Thời tiết Live</p>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)} 
              className="text-gray-400 hover:text-red-500 font-bold text-xl px-2 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* GẮN REF VÀO ĐÂY */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0A0D10]/50 scroll-smooth">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.isBot ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[90%] p-3.5 rounded-xl text-sm leading-relaxed shadow-sm ${
                  msg.isBot 
                    ? 'bg-[#1E293B] text-gray-200 rounded-tl-none border border-gray-700' 
                    : 'bg-[#00E5FF] text-gray-900 rounded-tr-none font-bold shadow-[0_0_15px_rgba(0,229,255,0.3)]'
                }`}>
                  {msg.isBot ? formatMessage(msg.text) : msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-[#1E293B] text-gray-400 p-3.5 rounded-xl rounded-tl-none text-sm animate-pulse border border-gray-700 flex items-center gap-2">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></span>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 bg-[#0A0D10] border-t border-gray-800 flex gap-2">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Hỏi đường, kẹt xe, thời tiết..."
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
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 不使用 StrictMode：避免 WebGL canvas 的 useEffect 被双调
createRoot(document.getElementById('root')!).render(<App />)

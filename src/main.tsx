import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

declare global {
  interface Window { Telegram?: { WebApp?: any } }
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('CodeRush render error:', error); }
  render() {
    if (this.state.failed) return <main className="fatal-screen" role="alert">
      <div className="fatal-mark">CR</div>
      <h1>{document.documentElement.lang==='ar'?'حدث خطأ غير متوقع':'Something went wrong'}</h1>
      <p>{document.documentElement.lang==='ar'?'تعذّر عرض هذه الشاشة. لم يتم حذف بياناتك التجريبية المحفوظة محلياً.':'The demo could not display this screen. Your locally saved demo data has not intentionally been cleared.'}</p>
      <button onClick={() => window.location.reload()}>{document.documentElement.lang==='ar'?'إعادة تحميل CodeRush':'Reload CodeRush'}</button>
    </main>;
    return this.props.children;
  }
}

const tg = window.Telegram?.WebApp;
if (tg) {
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.('#f7fbff');
    tg.setBackgroundColor?.('#f7fbff');
  } catch (error) {
    console.warn('Telegram WebApp presentation setup was unavailable:', error);
  }
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>);

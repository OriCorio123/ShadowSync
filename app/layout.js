import './globals.css';

export const metadata = {
  title: 'ShadowSync Hub',
  description: 'AI-Powered Motion Gaming Arcade',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Load Socket.io globally so children can use it from window if needed */}
        <script src="/socket.io/socket.io.js" async></script>
      </body>
    </html>
  );
}

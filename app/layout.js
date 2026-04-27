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
        {/* Load Socket.io from CDN to ensure it works on serverless environments like Vercel */}
        <script src="https://cdn.socket.io/4.7.5/socket.io.min.js" async></script>
      </body>
    </html>
  );
}

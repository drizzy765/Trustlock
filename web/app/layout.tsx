export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Georgia, serif", margin: 0, background: "#0f1410", color: "#f4efe4" }}>
        {children}
      </body>
    </html>
  );
}

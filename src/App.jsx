import { Outlet } from 'react-router-dom';
import { useContext } from 'react';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import { CartProvider } from './contexts/CartContext.jsx';
import { WishlistProvider } from './contexts/WishlistContext.jsx';
import { WalletProvider } from './contexts/WalletContext.jsx';
import { AdminProvider } from './contexts/AdminContext.jsx';
import { SupportProvider } from './contexts/SupportContext.jsx';
import { LayoutProvider } from './contexts/LayoutContext.jsx';
import { ThemeSurface } from './components/layout/LayoutRenderer.jsx';
import { ThemeContext } from './contexts/ThemeContext.jsx';
import './App.css';

/* Inside the providers so it can read the published theme. */
const Themed = ({ children }) => {
  const { isDarkMode } = useContext(ThemeContext);
  return (
    <>
      <ThemeSurface isDark={isDarkMode} />
      {children}
    </>
  );
};

function App() {
  return (
    <CartProvider>
      <WishlistProvider>
        <WalletProvider>
          <AdminProvider>
            <SupportProvider>
              <LayoutProvider>
                <Themed>
                  <div className="app-container">
                    <Navbar />
                    <Outlet />
                    <Footer />
                  </div>
                </Themed>
              </LayoutProvider>
            </SupportProvider>
          </AdminProvider>
        </WalletProvider>
      </WishlistProvider>
    </CartProvider>
  );
}

export default App;

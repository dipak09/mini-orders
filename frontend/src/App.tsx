import { NavLink, Route, Routes } from 'react-router-dom';
import { OrdersPage } from './pages/OrdersPage';
import { NewOrderPage } from './pages/NewOrderPage';
import { STAGE } from './config';

export function App() {
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <NavLink to="/" className="brand">
            Mini Orders
          </NavLink>
          <nav>
            <NavLink to="/" end>
              Orders
            </NavLink>
            <NavLink to="/new">New order</NavLink>
          </nav>
          {/* Never show a badge on prod; always on anything else, so you never demo the wrong site. */}
          {STAGE !== 'prod' && <span className="stage-badge">{STAGE}</span>}
        </div>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<OrdersPage />} />
          <Route path="/new" element={<NewOrderPage />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </>
  );
}

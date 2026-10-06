import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import OfferForm from './pages/OfferForm.jsx';
import Confirmation from './pages/Confirmation.jsx';
import Login from './pages/Login.jsx';
import Panel from './pages/Panel.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/ofrecer" element={<OfferForm />} />
      <Route path="/confirmacion" element={<Confirmation />} />
      <Route path="/login" element={<Login />} />
      <Route path="/panel" element={<ProtectedRoute><Panel /></ProtectedRoute>} />
    </Routes>
  );
}

import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Icon from '../components/Icon.jsx';

export default function Confirmation() {
  return (
    <Layout variant="plain">
      <main className="center-page">
        <div className="card-lg confirm">
          <span className="check-circle"><Icon name="check" size={28} /></span>
          <span className="eyebrow">OFERTA ENVIADA</span>
          <h1>¡Oferta recibida!</h1>
          <p>Gracias por compartirnos tu terreno. Nuestro equipo revisará tu propuesta y se pondrá en contacto contigo.</p>
          <Link to="/" className="btn">Volver al inicio</Link>
        </div>
      </main>
    </Layout>
  );
}

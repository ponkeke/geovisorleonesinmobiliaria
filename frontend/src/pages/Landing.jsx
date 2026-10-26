import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import FaqItem from '../components/FaqItem.jsx';
import imagenTerreno from '../assets/ImagenTerreno.png';
import leonConstructor from '../assets/LeonConstructor1.png';
import fotoGrupal from '../assets/foto-grupal.jpg';
import anuncio from '../assets/anuncio.jpg';
import { CONTACTO, PROYECTOS, TERRENOS, PREGUNTAS } from '../data/inicio.js';

const FEATURES = [
  ['sparkle', 'Proceso simple y sin cuenta', 'Completa tus datos en pocos minutos.'],
  ['pin', 'Delimita tu terreno', 'Dibuja el contorno con precisión.'],
  ['phone', 'Nos pondremos en contacto', 'Nuestro equipo revisará tu propuesta.'],
];

export default function Landing() {
  const closingBanner = useRef(null);
  const main = useRef(null);
  const [closingVisible, setClosingVisible] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window));

  useEffect(() => {
    if (closingVisible || !closingBanner.current) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setClosingVisible(true);
        observer.disconnect();
      }
    }, { threshold: .2 });
    observer.observe(closingBanner.current);
    return () => observer.disconnect();
  }, [closingVisible]);

  // Los elementos con data-reveal aparecen al entrar en pantalla; los hijos de data-reveal-group lo hacen en cascada.
  useEffect(() => {
    const raiz = main.current;
    if (!raiz || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return undefined;
    raiz.querySelectorAll('[data-reveal-group]').forEach((grupo) => {
      Array.from(grupo.children).forEach((hijo, i) => {
        hijo.setAttribute('data-reveal', 'up');
        hijo.style.setProperty('--i', i);
      });
    });
    const observer = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => { if (e.isIntersecting) { e.target.setAttribute('data-in', ''); observer.unobserve(e.target); } });
    }, { threshold: .15, rootMargin: '0px 0px -6% 0px' });
    raiz.classList.add('reveal-ready');
    raiz.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));
    return () => { observer.disconnect(); raiz.classList.remove('reveal-ready'); };
  }, []);

  return (
    <Layout variant="public">
      <main className="landing" ref={main}>
        <section className="hero" aria-labelledby="inicio-titulo">
          <img className="hero-bg" src={imagenTerreno} alt="" aria-hidden="true" />
          <div className="hero-card" data-reveal="up">
            <span className="eyebrow">ADQUISICIÓN DE TERRENOS</span>
            <h1 id="inicio-titulo">¿Tienes un terreno que deseas ofrecer?</h1>
            <p>Compártenos su ubicación y características. Evaluaremos su potencial con criterios técnicos, comerciales y legales.</p>
            <Link to="/ofrecer" className="btn">Ofrecer mi terreno <Icon name="arrow" size={16} /></Link>
          </div>
        </section>
        <section className="features" aria-label="Ventajas de ofrecer tu terreno" data-reveal-group>
          {FEATURES.map(([icon, title, text]) => (
            <div key={title} className="feature">
              <span className="feature-icon"><Icon name={icon} /></span>
              <div><b>{title}</b><p>{text}</p></div>
            </div>
          ))}
        </section>

        <section className="landing-section terrain-section" id="terrenos" aria-labelledby="terrenos-titulo">
          <div className="landing-container">
            <div className="section-heading" data-reveal="up">
              <span className="eyebrow">TERRENOS CON POTENCIAL</span>
              <h2 id="terrenos-titulo">¿Qué buscamos en un terreno?</h2>
              <p>Cada propuesta tiene algo que la hace única. Cuéntanos sus características para conocer sus posibilidades.</p>
            </div>
            <div className="terrain-cards" data-reveal-group>
              {TERRENOS.map(({ icono, titulo, texto }) => (
                <article className="terrain-card" key={titulo}>
                  <span className="landing-icon"><Icon name={icono} size={24} /></span>
                  <h3>{titulo}</h3>
                  <p>{texto}</p>
                </article>
              ))}
            </div>
            <p className="section-note" data-reveal="up"><Icon name="shield" size={16} /> Cada terreno se evalúa de manera individual.</p>
          </div>
        </section>

        <section className="landing-section about-section" id="nosotros" aria-labelledby="nosotros-titulo">
          <div className="landing-container about-grid">
            <div className="about-media" data-reveal="left">
              <div className="about-brand">
                <img className="about-foto" src={fotoGrupal} width="1580" height="996" loading="lazy"
                  alt="Equipo de Leones Grupo Inmobiliario durante una jornada de titulación" />
                <div className="about-brand-overlay">
                  <Logo light />
                  <span className="about-brand-line" aria-hidden="true" />
                  <p>Una nueva posibilidad<br /><strong>comienza con tu terreno.</strong></p>
                </div>
              </div>
            </div>
            <div className="about-copy" data-reveal="right">
              <span className="eyebrow">CONOCE A LEONES</span>
              <h2 id="nosotros-titulo">Miramos más allá de la ubicación.</h2>
              <p>En Leones Grupo Inmobiliario recibimos propuestas de propietarios que desean ofrecer sus terrenos y evaluamos su potencial de adquisición.</p>
              <p>Combinamos la información del predio con una revisión técnica, legal y financiera para conocer sus posibilidades.</p>
              <ul className="about-values" data-reveal-group>
                <li><Icon name="clipboard" /> Evaluación técnica</li>
                <li><Icon name="shield" /> Revisión legal</li>
                <li><Icon name="tag" /> Análisis financiero</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="landing-section projects-section" id="proyectos" aria-labelledby="proyectos-titulo">
          <div className="landing-container">
            <div className="section-heading" data-reveal="up">
              <span className="eyebrow">PROYECTOS DE LEONES</span>
              <h2 id="proyectos-titulo">Terrenos que abren nuevas oportunidades.</h2>
              <p>Un buen proyecto comienza con una buena ubicación. Conoce el espacio dedicado a nuestros proyectos y novedades.</p>
            </div>
            {PROYECTOS.length > 0 ? (
              <div className="project-cards" data-reveal-group>
                {PROYECTOS.map((proyecto) => (
                  <article className="project-card" key={proyecto.nombre}>
                    {proyecto.imagen && <img src={proyecto.imagen} alt={proyecto.nombre} loading="lazy" />}
                    <div className="project-card-copy">
                      <h3>{proyecto.nombre}</h3>
                      <p className="project-location"><Icon name="pin" size={16} /> {proyecto.ubicacion}</p>
                      <p>{proyecto.descripcion}</p>
                      {proyecto.enlace && <a className="textbtn" href={proyecto.enlace} target="_blank" rel="noopener noreferrer">Conocer el proyecto <Icon name="arrowUR" size={16} /></a>}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="project-preview" data-reveal="up">
                <div className="project-preview-image">
                  <img src={anuncio} width="1600" height="702" loading="lazy"
                    alt="Anuncio de Leones: próximamente, gran lanzamiento del Residencial Chalay en San Jerónimo" />
                </div>
                <div className="project-preview-copy">
                  <span className="chip">PRÓXIMAMENTE</span>
                  <h3>Nuevos proyectos,<br />nuevas posibilidades.</h3>
                  <p>Aquí compartiremos los proyectos y novedades de Leones. Mientras tanto, tu terreno puede ser el punto de partida de una nueva oportunidad.</p>
                  <Link to="/ofrecer" className="btn">Ofrecer mi terreno <Icon name="arrow" size={16} /></Link>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="landing-section faq-section" id="preguntas" aria-labelledby="preguntas-titulo">
          <div className="landing-container">
            <div className="faq-head" data-reveal="up">
              <span className="eyebrow">PREGUNTAS FRECUENTES</span>
              <h2 className="faq-title" id="preguntas-titulo">Resolvemos tus <em>dudas</em></h2>
              <p>Lo esencial que debes saber antes de ofrecer tu terreno.</p>
            </div>
            <div className="faq-grid">
              <div className="faq-brand" data-reveal="left">
                <div className="faq-leon">
                  <img className="faq-image" src={leonConstructor} alt="León constructor de Leones" width="1164" height="1351" loading="lazy" />
                </div>
              </div>
              <div className="faq-col">
                <div className="faq-list" data-reveal-group>
                  {PREGUNTAS.map(({ pregunta, respuesta }, i) => (
                    <FaqItem key={pregunta} numero={i + 1} pregunta={pregunta} respuesta={respuesta} />
                  ))}
                </div>
                <div className="faq-contacto" data-reveal="up">
                  <div>
                    <b>¿Aún tienes dudas?</b>
                    <p>Escríbenos o llámanos y te ayudamos con tu propuesta.</p>
                  </div>
                  <div className="faq-contacto-btns">
                    <a className="btn" href={CONTACTO.telefonoEnlace}><Icon name="phone" size={16} /> Llamar</a>
                    <a className="btn outline-light" href={`mailto:${CONTACTO.correo}`}><Icon name="mail" size={16} /> Escribir</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>
      <div className={`closing-banner${closingVisible ? ' is-visible' : ''}`} ref={closingBanner}>
        <p>Tu terreno puede ser nuestro próximo proyecto.</p>
      </div>
      <footer className="landing-footer" id="contacto">
        <div className="landing-container footer-content">
          <div className="footer-brand">
            <Logo light />
            <p>Leones Grupo Inmobiliario · Adquisición de terrenos</p>
          </div>
          <address className="footer-contacts" aria-label="Contactos de Leones">
            <span className="footer-label">CONTÁCTANOS</span>
            <a href={CONTACTO.telefonoEnlace}><Icon name="phone" size={18} /><span>{CONTACTO.telefono}</span></a>
            <a href={`mailto:${CONTACTO.correo}`}><Icon name="mail" size={18} /><span>{CONTACTO.correo}</span></a>
          </address>
          <nav aria-label="Enlaces al pie de página">
            <a href="#nosotros">Nosotros</a>
            <a href="#preguntas">Preguntas frecuentes</a>
            <a href="#contacto">Contacto</a>
          </nav>
        </div>
      </footer>
    </Layout>
  );
}

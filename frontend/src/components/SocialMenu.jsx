import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { REDES_SOCIALES } from '../data/inicio.js';

export default function SocialMenu() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef(null);
  const container = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const menuId = useId();

  const close = useCallback(() => {
    if (!open) return;
    if (menu.current?.contains(document.activeElement)) trigger.current?.focus();
    setOpen(false);
    clearTimeout(closeTimer.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setClosing(false);
      return;
    }
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      setClosing(false);
      closeTimer.current = null;
    }, 300);
  }, [open]);

  const toggle = () => {
    if (open) {
      close();
    } else {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
      setClosing(false);
      setOpen(true);
    }
  };

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector('a')?.focus();
    const outside = (event) => {
      if (!container.current?.contains(event.target)) close();
    };
    const escape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, close]);

  return createPortal(
    <div className="social-menu" ref={container} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) close();
    }}>
      <button className="social-menu-trigger" type="button" ref={trigger} aria-label="Redes sociales de Leones"
        aria-expanded={open} aria-controls={menuId} onClick={toggle}>
        <Icon name="more" size={24} />
      </button>
      {(open || closing) && (
        <nav className={`social-dropdown${closing ? ' is-closing' : ''}`} id={menuId} ref={menu} aria-label="Redes sociales"
          aria-hidden={closing ? true : undefined} inert={closing ? '' : undefined}>
          {REDES_SOCIALES.map(({ nombre, icono, enlace }, index) => (
            <a key={nombre} className={`social-circle social-${icono}`} href={enlace} target="_blank" rel="noopener noreferrer"
              aria-label={nombre} title={nombre} style={{ '--social-delay': `${index * 50}ms`, '--social-close-delay': `${(REDES_SOCIALES.length - 1 - index) * 45}ms` }} onClick={close}>
              <Icon name={icono} size={26} />
            </a>
          ))}
        </nav>
      )}
    </div>,
    document.body,
  );
}

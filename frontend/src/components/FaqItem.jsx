import { useId, useState } from 'react';
import Icon from './Icon.jsx';

export default function FaqItem({ pregunta, respuesta, numero }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <article className={`faq-item${open ? ' is-open' : ''}`}>
      <h3 className="faq-question">
        <button type="button" id={`${id}-question`} aria-expanded={open} aria-controls={`${id}-answer`}
          onClick={() => setOpen((value) => !value)}>
          {numero && <b className="faq-num" aria-hidden="true">{String(numero).padStart(2, '0')}</b>}
          <span>{pregunta}</span><Icon name="plus" size={20} />
        </button>
      </h3>
      <div className="faq-answer" id={`${id}-answer`} role="region" aria-labelledby={`${id}-question`}
        aria-hidden={!open} inert={open ? undefined : ''}>
        <div className="faq-answer-content"><p>{respuesta}</p></div>
      </div>
    </article>
  );
}

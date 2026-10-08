import { getModelCard } from '@/lib/data';
import { site } from '@/site.config';

export function Footer() {
  const card = getModelCard();
  return (
    <footer className="band site-foot">
      <div className="wrap">
        <div className="site-foot__grid">
          <div>
            <p className="site-foot__name">{site.name}</p>
            <p className="small">{site.subtitle}</p>
          </div>
          <div>
            <h2 className="label">مصادر الصور · Kaggle</h2>
            <ul>
              {Object.entries(card.data.sources).map(([id, source]) => (
                <li key={id}>
                  <a href={`https://www.${source}`} rel="noreferrer" target="_blank">
                    <bdi dir="ltr">{source.replace('kaggle.com/datasets/', '')}</bdi>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="label">إعداد</h2>
            <ul>
              <li>{site.author.name}</li>
              <li>
                <a href={site.author.linkedin} target="_blank" rel="noopener noreferrer">
                  <bdi dir="ltr">LinkedIn</bdi>
                </a>
              </li>
              <li>
                <a href={site.author.x} target="_blank" rel="noopener noreferrer">
                  <bdi dir="ltr">X</bdi>
                </a>
              </li>
              <li>
                <a href={site.author.github} target="_blank" rel="noopener noreferrer">
                  <bdi dir="ltr">GitHub</bdi>
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="site-foot__base label">
          <span>
            النموذجان يعملان في المتصفح عبر <bdi dir="ltr">onnxruntime-web</bdi>. لا خادم، ولا رفع للصور.
          </span>
          <span>
            <bdi dir="ltr">
              TensorFlow {card.versions.tensorflow} · Keras {card.versions.keras} · {card.created}
            </bdi>
          </span>
        </div>
      </div>
    </footer>
  );
}

interface Props {
  num: string;
  name: string;
  title?: React.ReactNode;
  id?: string;
  band?: boolean;
  children: React.ReactNode;
}

/** Numbered section: a mono rail in the side column, content in the wide one. */
export function Section({ num, name, title, id, band, children }: Props) {
  return (
    <section id={id} className={band ? 'section band' : 'section'}>
      <div className="wrap section__grid">
        <div className="rail">
          <span className="rail__num">{num}</span>
          <span className="rail__name">{name}</span>
        </div>
        <div className="section__body">
          {title ? <h2 className="display h2 reveal">{title}</h2> : null}
          {children}
        </div>
      </div>
    </section>
  );
}

/** A technical Latin term that must not reorder the Arabic around it. */
export function L({ children }: { children: React.ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

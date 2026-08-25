export function Header() {
  return (
    <header className="header">
      <div className="header__mark">
        <span className="wordmark">Stackly</span>
        <span className="header__tag">
          Combine images, PDFs, and Word documents into a single PDF.
        </span>
      </div>
      <p className="header__privacy">
        <span className="dot" aria-hidden="true" />
        Files are processed in your browser. Nothing is uploaded.
      </p>
    </header>
  );
}

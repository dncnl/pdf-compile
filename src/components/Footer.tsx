import { IconGitHub, IconLinkedIn, IconMail } from './icons.tsx';

const EMAIL = 'danielcanlapan0402@gmail.com';
const GITHUB_URL = 'https://github.com/dncnl';
const LINKEDIN_URL = 'https://www.linkedin.com/in/daniel-martin-canlapan-1b2760380/';

const CONTACTS = [
  { label: 'Email', href: `mailto:${EMAIL}`, Icon: IconMail },
  { label: 'LinkedIn', href: LINKEDIN_URL, Icon: IconLinkedIn },
  { label: 'GitHub', href: GITHUB_URL, Icon: IconGitHub },
];

export function Footer() {
  return (
    <footer className="footer">
      <p>Stackly runs entirely in your browser. No account, no upload, no server.</p>

      <nav className="footer__nav" aria-label="Contact">
        <ul className="footer__links">
          {CONTACTS.map(({ label, href, Icon }) => (
            <li key={label}>
              <a
                className="footer__link"
                href={href}
                {...(href.startsWith('mailto:')
                  ? {}
                  : { target: '_blank', rel: 'noopener noreferrer' })}
              >
                <Icon />
                <span>{label}</span>
              </a>
            </li>
          ))}
          <li>
            <a
              className="footer__link"
              href="https://github.com/dncnl/pdf-compile"
              target="_blank"
              rel="noopener noreferrer"
            >
              Source
            </a>
          </li>
        </ul>
      </nav>
    </footer>
  );
}

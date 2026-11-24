import { FaLinkedin } from "react-icons/fa";
import { SiGmail, SiGithub, SiWhatsapp } from "react-icons/si";

const profiles = [
  { label: "Email", icon: SiGmail, href: "mailto:abdilahimohamed459@gmail.com" },
  { label: "WhatsApp", icon: SiWhatsapp, href: "https://wa.me/252634594307?s=p" },
  { label: "LinkedIn", icon: FaLinkedin, href: "https://www.linkedin.com/in/abdilahi-mohamed-564317393" },
  { label: "GitHub", icon: SiGithub, href: "https://github.com/Abdilahi-mohamed" }
];

export default function ContactSection() {
  return (
    <section className="personal-contact-section" id="contact">
      <div className="personal-contact-content section-wrap">
        <span className="section-kicker">LET'S WORK TOGETHER</span>
        <h2>Contact <span>Me</span></h2>
        <p>Choose the channel that works best for you.</p>
        <div className="personal-social-profiles" aria-label="Abdilahi Mohamed contact and social profiles">
          {profiles.map(({ label, icon: Icon, href }) => (
            <a
              key={label}
              href={href}
              target={href.startsWith("mailto:") ? undefined : "_blank"}
              rel={href.startsWith("mailto:") ? undefined : "noreferrer"}
              aria-label={label}
              title={label}
            >
              <Icon />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

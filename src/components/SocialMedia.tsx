import {
  FaInstagram,
  FaFacebook,
  FaYoutube,
  FaLinkedin,
  FaTiktok,
} from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";

import "./SocialMedia.css";

const links = [
  {
    title: "Instagram",
    url: "https://instagram.com/coastlifellc",
    icon: <FaInstagram />,
    color: "#E1306C",
  },
  {
    title: "Facebook",
    url: "https://www.facebook.com/share/1J7PS9GhRr/?mibextid=wwXIfr",
    icon: <FaFacebook />,
    color: "#1877F2",
  },
  {
    title: "YouTube",
    url: "https://youtube.com/@thecoastlife",
    icon: <FaYoutube />,
    color: "#FF0000",
  },
  {
    title: "LinkedIn",
    url: "https://www.linkedin.com/company/coast-life",
    icon: <FaLinkedin />,
    color: "#0A66C2",
  },
  {
    title: "X",
    url: "https://x.com/coastlifellc",
    icon: <FaXTwitter />,
    color: "#000000",
  },
  {
    title: "TikTok",
    url: "https://www.tiktok.com/@coastlife.llc",
    icon: <FaTiktok />,
    color: "#000000",
  },
];

function SocialMedia() {
  return (
    <div className="social-page">
      <h1>Follow Coast Life</h1>
      <p className="subtitle">
        Connect with us on your favorite social platforms.
      </p>

      <div className="social-grid">
        {links.map((link) => (
          <a
            key={link.title}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="social-card"
          >
            <div className="social-icon" style={{ color: link.color }}>
              {link.icon}
            </div>

            <span>{link.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export default SocialMedia;

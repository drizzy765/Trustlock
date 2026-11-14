import Image from "next/image";
import Link from "next/link";
import { contractId } from "@/lib/config";
import { explorerAccountUrl } from "@/lib/format";
import ChainValue from "./ChainValue";

const CREDITS = [
  { name: "Hanna Pad", href: "https://www.pexels.com/photo/a-woman-typing-while-looking-at-boxes-7552726/" },
  { name: "Tima Miroshnichenko", href: "https://www.pexels.com/photo/man-in-white-button-up-shirt-and-black-cap-holding-a-clipboard-6169652/" },
  { name: "Ono Kosuki", href: "https://www.pexels.com/photo/crop-concentrated-ethnic-businesswoman-with-smartphone-5999793/" },
  { name: "Shalom Osezua", href: "https://www.pexels.com/photo/man-holding-a-smart-phone-with-both-hands-18051668/" },
  { name: "Kindel Media", href: "https://www.pexels.com/photo/a-woman-receiving-her-delivered-items-6869055/" },
  { name: "Gustavo Fring", href: "https://www.pexels.com/photo/a-woman-with-purple-hair-6720598/" },
];

export default function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto max-w-[1200px] px-5 py-12 md:px-8">
        <Link href="/" aria-label="TrustLock home" className="inline-flex rounded-[6px]">
          <Image src="/brand/trustlock-logo-dark.svg" alt="TrustLock" width={90} height={24} className="h-6 w-auto" />
        </Link>
        <p className="mt-4 max-w-[560px] text-mute">Pay on delivery for African sellers across social media and any chat app.</p>
        <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-faint">
          <span>Escrow contract</span>
          <ChainValue value={contractId} href={explorerAccountUrl(contractId)} label="contract id" />
        </div>
        <p className="mt-4 max-w-[720px] text-sm text-faint">
          Built on NEAR testnet with testnet USDC, MyNearWallet, and a NEAR Intents 1Click dry quote.{" "}
          <span className="text-mute">Testnet. No real money moves.</span>
        </p>
        <p className="mt-4 text-sm text-faint">
          Photos from Pexels by{" "}
          {CREDITS.map((c, i) => (
            <span key={c.name}>
              <a href={c.href} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-bone hover:underline">
                {c.name}
              </a>
              {i < CREDITS.length - 2 ? ", " : i === CREDITS.length - 2 ? " and " : "."}
            </span>
          ))}
        </p>
      </div>
    </footer>
  );
}

import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface LegalPageProps {
  type: "terms" | "privacy" | "risk" | "contact";
}

export default function LegalPage({ type }: LegalPageProps) {
  const getContent = () => {
    switch (type) {
      case "terms":
        return {
          title: "Terms of Service",
          content: (
            <>
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">1. Acceptance of Terms</h2>
                <p className="text-gray-300 mb-4">
                  By accessing or using HiveMind ("the Platform"), you agree to be bound by these Terms of Service. 
                  If you do not agree to these terms, do not use the Platform.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">2. Platform Description</h2>
                <p className="text-gray-300 mb-4">
                  HiveMind is a decentralized AI training platform where users contribute to training AI models 
                  through gamified quiz interactions. The Platform uses blockchain technology for authentication, 
                  token gating, and reward distribution.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">3. Eligibility</h2>
                <p className="text-gray-300 mb-4">
                  You must be at least 18 years old to use this Platform. By using the Platform, 
                  you represent that you meet this age requirement and have the legal capacity to enter into this agreement.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">4. Token Requirements</h2>
                <p className="text-gray-300 mb-4">
                  Access to certain features requires holding HIVE tokens. Token holdings are verified on-chain. 
                  The Platform is not responsible for fluctuations in token value or liquidity.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">5. Training Submissions</h2>
                <p className="text-gray-300 mb-4">
                  Training submissions are subject to review. Approved submissions may contribute to AI model training. 
                  By submitting content, you grant HiveMind a non-exclusive license to use this content for AI training purposes.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">6. Economic Rules</h2>
                <p className="text-gray-300 mb-4">
                  Training fees are deducted from staked HIVE tokens. Refunds are based on submission performance 
                  as determined by the Platform's scoring system. Economic parameters may be adjusted by the Platform.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">7. Limitation of Liability</h2>
                <p className="text-gray-300 mb-4">
                  THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. 
                  WE ARE NOT LIABLE FOR ANY DAMAGES ARISING FROM YOUR USE OF THE PLATFORM, 
                  INCLUDING LOSS OF TOKENS OR DIGITAL ASSETS.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">8. Modifications</h2>
                <p className="text-gray-300 mb-4">
                  We reserve the right to modify these Terms at any time. Continued use of the Platform 
                  after changes constitutes acceptance of the modified Terms.
                </p>
              </section>
            </>
          ),
        };
        
      case "privacy":
        return {
          title: "Privacy Policy",
          content: (
            <>
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">1. Information We Collect</h2>
                <p className="text-gray-300 mb-4">
                  We collect wallet addresses for authentication, training submission data, 
                  and usage analytics. We do not collect personal identifying information 
                  beyond what is publicly available on the blockchain.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">2. How We Use Information</h2>
                <p className="text-gray-300 mb-4">
                  Information is used to provide Platform services, improve AI model training, 
                  calculate rewards, and maintain Platform security.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">3. Data Storage</h2>
                <p className="text-gray-300 mb-4">
                  Training data and user interactions are stored in secure databases. 
                  Blockchain transactions are public and immutable.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">4. Third-Party Services</h2>
                <p className="text-gray-300 mb-4">
                  We use third-party services for blockchain interactions (Solana RPC providers) 
                  and analytics. These services have their own privacy policies.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">5. Data Retention</h2>
                <p className="text-gray-300 mb-4">
                  We retain training data and submission history for the operational life of the Platform. 
                  You may request deletion of non-blockchain data by contacting us.
                </p>
              </section>
            </>
          ),
        };
        
      case "risk":
        return {
          title: "Risk Disclaimers",
          content: (
            <>
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4 text-yellow-400">Important Warnings</h2>
                <p className="text-gray-300 mb-4">
                  Please read these risk disclaimers carefully before using HiveMind.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">1. Token Risk</h2>
                <p className="text-gray-300 mb-4">
                  HIVE tokens are digital assets with no guaranteed value. Token prices can be highly volatile. 
                  You may lose some or all of your token holdings. This is not financial advice.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">2. Smart Contract Risk</h2>
                <p className="text-gray-300 mb-4">
                  Blockchain interactions involve smart contracts which may contain bugs or vulnerabilities. 
                  While we take security seriously, we cannot guarantee the security of on-chain components.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">3. Training Economics</h2>
                <p className="text-gray-300 mb-4">
                  Training fees are deducted when you submit attempts. Refunds depend on your performance 
                  and are not guaranteed. Poor performance may result in partial or complete loss of staked fees.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">4. Wallet Security</h2>
                <p className="text-gray-300 mb-4">
                  You are responsible for securing your wallet and private keys. We never ask for your 
                  seed phrase or private keys. Wallet compromise may result in loss of funds.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">5. Regulatory Uncertainty</h2>
                <p className="text-gray-300 mb-4">
                  Cryptocurrency regulations vary by jurisdiction and may change. You are responsible for 
                  understanding and complying with applicable laws in your region.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">6. No Guarantees</h2>
                <p className="text-gray-300 mb-4">
                  The Platform makes no guarantees about rewards, token value, AI model performance, 
                  or future availability of the service.
                </p>
              </section>
            </>
          ),
        };
        
      case "contact":
        return {
          title: "Contact & Support",
          content: (
            <>
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">Get in Touch</h2>
                <p className="text-gray-300 mb-4">
                  Have questions, feedback, or need assistance? We're here to help.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">Community Channels</h2>
                <div className="space-y-3">
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="font-medium mb-1">Discord</h3>
                    <p className="text-gray-400 text-sm">Join our community for real-time support and discussions.</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="font-medium mb-1">Twitter / X</h3>
                    <p className="text-gray-400 text-sm">Follow us for announcements and updates.</p>
                  </div>
                </div>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">Technical Support</h2>
                <p className="text-gray-300 mb-4">
                  For technical issues, please provide:
                </p>
                <ul className="list-disc list-inside text-gray-400 space-y-2">
                  <li>Your wallet address (first 6 and last 4 characters)</li>
                  <li>Description of the issue</li>
                  <li>Any relevant transaction signatures</li>
                  <li>Screenshots if applicable</li>
                </ul>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">Response Times</h2>
                <p className="text-gray-300 mb-4">
                  We aim to respond to all inquiries within 24-48 hours. 
                  Complex issues may require additional time to investigate.
                </p>
              </section>
              
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">Security Concerns</h2>
                <p className="text-gray-300 mb-4">
                  If you discover a security vulnerability, please report it responsibly. 
                  Do not publicly disclose security issues before we have had a chance to address them.
                </p>
              </section>
            </>
          ),
        };
    }
  };
  
  const { title, content } = getContent();
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <Link href="/" className="inline-flex items-center text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Link>
      </div>
      
      <div className="bg-gray-800/50 rounded-xl p-8 border border-gray-700">
        <h1 className="text-3xl font-bold mb-8">{title}</h1>
        
        <div className="prose prose-invert max-w-none">
          {content}
        </div>
        
        <div className="mt-8 pt-6 border-t border-gray-700 text-gray-500 text-sm">
          Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </div>
      </div>
      
      <div className="mt-6 flex flex-wrap gap-4 text-sm text-gray-400">
        <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
        <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
        <Link href="/risk" className="hover:text-white transition-colors">Risk Disclaimers</Link>
        <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
      </div>
    </div>
  );
}

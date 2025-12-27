import React from 'react'

export default function Footer() {
  return (
    <footer className="py-12 border-t border-dark-border">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧠</span>
            <span className="font-bold text-lg text-white">Train Your AI</span>
          </div>
          
          <div className="flex items-center gap-6">
            <a
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-neon-cyan transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Follow on X
            </a>
          </div>
        </div>

        <div className="text-center mb-6">
          <p className="text-gray-400 text-sm max-w-2xl mx-auto">
            Train Your AI is an educational experiment that turns training an AI model into an interactive quiz experience. Learn how data quality affects intelligence through hands-on participation.
          </p>
        </div>

        <div className="glass-card p-4 text-center">
          <p className="text-xs text-gray-500 mb-2">
            <strong>Disclaimer:</strong> Nothing on this site or in the Train Your AI ecosystem is financial advice.
          </p>
          <p className="text-xs text-gray-500">
            The on-page demo stores its data only in your browser. $BRAIN tokens are experimental and for educational/entertainment use only.
          </p>
        </div>

        <div className="text-center mt-6">
          <p className="text-xs text-gray-600">
            © {new Date().getFullYear()} Train Your AI. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

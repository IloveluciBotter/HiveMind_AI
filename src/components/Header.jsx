import React, { useState } from 'react'

export default function Header({ onNavigate }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const navItems = [
    { label: 'Overview', section: 'hero' },
    { label: 'How It Works', section: 'how-it-works' },
    { label: 'Interactive Lab', section: 'lab' },
    { label: 'Token', section: 'token' },
    { label: 'FAQ', section: 'faq' }
  ]

  const scrollTo = (sectionId) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
    setMenuOpen(false)
    if (onNavigate) onNavigate(sectionId)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-card border-t-0 rounded-t-none">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧠</span>
          <span className="font-bold text-lg text-white">Train Your AI</span>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          {navItems.map(item => (
            <button
              key={item.section}
              onClick={() => scrollTo(item.section)}
              className="text-sm text-gray-300 hover:text-neon-cyan transition-colors"
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={() => scrollTo('lab')}
            className="px-4 py-2 bg-gradient-to-r from-neon-cyan to-neon-purple text-black font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity"
          >
            Try the Lab
          </button>
        </nav>

        <button
          className="md:hidden text-white p-2"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden px-4 pb-4 space-y-2">
          {navItems.map(item => (
            <button
              key={item.section}
              onClick={() => scrollTo(item.section)}
              className="block w-full text-left py-2 text-gray-300 hover:text-neon-cyan transition-colors"
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={() => scrollTo('lab')}
            className="w-full px-4 py-2 bg-gradient-to-r from-neon-cyan to-neon-purple text-black font-semibold rounded-lg text-sm"
          >
            Try the Lab
          </button>
        </div>
      )}
    </header>
  )
}

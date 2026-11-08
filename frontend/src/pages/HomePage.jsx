export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="text-center py-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          AI-Powered Civic Intelligence
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          CivicPulse AI detects, classifies, prioritises and coordinates responses
          to civic issues across Bengaluru — powered by multi-agent AI.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { title: 'Report an Issue',   desc: 'Submit potholes, garbage, flooding or road damage with a photo and location.', href: '/report'    },
          { title: 'Live Dashboard',    desc: 'Monitor issue status, agent actions, and resolution timelines in real time.',  href: '/dashboard' },
          { title: 'City Map',          desc: 'Explore active issues geographically across all Bengaluru wards.',             href: '/map'       },
        ].map(({ title, desc, href }) => (
          <a
            key={href}
            href={href}
            className="block p-6 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <h2 className="text-lg font-semibold text-civic-700 mb-2">{title}</h2>
            <p className="text-sm text-gray-600">{desc}</p>
          </a>
        ))}
      </section>
    </div>
  )
}

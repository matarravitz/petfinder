import './theme.css'

export default function Layout({ children }) {
  return (
    <div>
      <header role="banner" className="app-header">
        <h1 className="app-title">PetFinder</h1>
        <p className="app-tagline">Every lost pet has someone looking for them.</p>
      </header>
      <main className="app-main">{children}</main>
    </div>
  )
}

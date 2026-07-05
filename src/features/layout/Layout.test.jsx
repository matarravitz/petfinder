import { render, screen } from '@testing-library/react'
import Layout from './Layout.jsx'

test('renders the app header and its children', () => {
  render(
    <Layout>
      <p>page content</p>
    </Layout>
  )
  expect(screen.getByRole('banner')).toHaveTextContent('PetFinder')
  expect(screen.getByText('page content')).toBeInTheDocument()
})

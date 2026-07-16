import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthContext.jsx'
import Layout from './features/layout/Layout.jsx'
import HomePage from './features/home/HomePage.jsx'
import LoginPage from './features/auth/LoginPage.jsx'
import SignupPage from './features/auth/SignupPage.jsx'
import BrowseFeedPage from './features/posts/BrowseFeedPage.jsx'
import CreatePostForm from './features/posts/CreatePostForm.jsx'
import PostDetailPage from './features/posts/PostDetailPage.jsx'
import MyPostsDashboard from './features/posts/MyPostsDashboard.jsx'
import MessagesPage from './features/messages/MessagesPage.jsx'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/browse" element={<BrowseFeedPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/post/new" element={<CreatePostForm />} />
            <Route path="/post/:id" element={<PostDetailPage />} />
            <Route path="/my-posts" element={<MyPostsDashboard />} />
            <Route path="/messages" element={<MessagesPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  )
}

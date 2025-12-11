import { useAuthStore } from '@/store/authStore'
import { useShallow } from 'zustand/react/shallow'
import AuthPanel from '@/components/AuthPanel'
import EventRegisterPanel from '@/components/EventRegisterPanel'
import { Box, CircularProgress } from '@mui/material'
import './App.css'

function App() {
  const { accessToken, initializing } = useAuthStore(
    useShallow((state) => ({
      accessToken: state.accessToken,
      initializing: state.initializing,
    }))
  )

  if (initializing) {
    return (
      <Box
        sx={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress enableTrackSlot size={80} />
      </Box>
    )
  }

  return accessToken ? <EventRegisterPanel /> : <AuthPanel />
}

export default App

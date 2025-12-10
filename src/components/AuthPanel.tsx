import AuthSection from "@/components/AuthSection";
import { useAuthStore } from "@/store/authStore";
import { Alert, Box, Stack, Typography } from "@mui/material";

export default function AuthPanel() {
  const error = useAuthStore((state) => state.error);

  return (
    <Box
      sx={{
        height: "100vh",
        width: "100vw",
        justifyContent: "center",
        alignItems: "center",
        display: "flex",
      }}
    >
      <Stack spacing={3} sx={{ width: "85%" }}>
        <Typography
          component="h1"
          variant="h4"
          align="center"
          fontWeight={600}
          sx={{ marginTop: 0 }}
        >
          Google 認証
        </Typography>

        <AuthSection />

        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Box>
  );
}

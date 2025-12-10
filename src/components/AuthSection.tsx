import { useAuthStore } from "@/store/authStore";
import { Box, Button, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import { useShallow } from "zustand/react/shallow";

const AuthSection = () => {
  const { initializing, loading, accessToken, login, cancel } = useAuthStore(
    useShallow((state) => ({
      initializing: state.initializing,
      loading: state.loading,
      accessToken: state.accessToken,
      login: state.login,
      cancel: state.cancel,
    }))
  );

  return (
    <Paper
      elevation={6}
      sx={{
        borderRadius: 3,
        p: 3,
        pt: 4,
        mx: 20,
      }}
    >
      <Stack spacing={2} position="relative">
        {!accessToken && (
          <Stack spacing={2}>
            <Button
              onClick={login}
              disabled={loading}
              variant="contained"
              startIcon={<GoogleIcon />}
              disableElevation
              sx={{
                py: 1.35,
                fontSize: 16,
                fontWeight: 700,
                textTransform: "none",
                mx: 0,
              }}
            >
              {loading ? "認証中..." : "Googleで認証"}
            </Button>

            {loading && (
              <Button
                onClick={cancel}
                variant="outlined"
                color="error"
                sx={{
                  py: 1.35,
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                やめる
              </Button>
            )}
          </Stack>
        )}

        {loading && <LinearProgress color="primary" sx={{ borderRadius: 999 }} />}

        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
          {initializing
            ? "認証情報を確認しています..."
            : loading
            ? "認証中..."
            : "認証してください。"}
        </Typography>
      </Stack>
    </Paper>
  );
};

export default AuthSection;

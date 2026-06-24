'use client'

import {
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from "@mui/material";
import { MouseEvent, useState, useCallback } from "react";
import MenuOpenIcon from "@mui/icons-material/Menu";
import Image from "next/image";
import { useRouter } from "next/navigation";

const MainMenu = () => {
  const router = useRouter();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  // 🔁 toggle open/close
  const handleToggle = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl((prev) => (prev ? null : event.currentTarget));
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const go = useCallback(
    (path: string) => {
      handleClose();
      router.push(path);
    },
    [router, handleClose]
  );

  return (
    <>
      <Button
        onClick={handleToggle}
        aria-controls={open ? "main-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        sx={{
          position: "absolute",
          left: 8,
          top: 8,
          zIndex: 14000,
          minWidth: 0,
          p: 1,
          borderRadius: 2,

          bgcolor: open ? "primary.main" : "background.paper",
          color: open ? "primary.contrastText" : "text.primary",

          boxShadow: 2,
          transition: "all 120ms ease-out",

          "&:hover": {
            transform: "scale(1.05)",
            bgcolor: open ? "primary.dark" : "action.hover",
          },
        }}
      >
        <MenuOpenIcon
          style={{
            transition: "transform 120ms ease",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        />
      </Button>

      <Menu
        id="main-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        disableAutoFocusItem
        transitionDuration={120}
        slotProps={{
          paper: {
            elevation: 8,
            sx: {
              mt: 1,
              minWidth: 220,
              borderRadius: 2,
              overflow: "hidden",
            },
          },
        }}
      >
        <MenuItem onClick={() => go("/")}>
          <ListItemIcon>
            <Image
              alt=""
              width={20}
              height={20}
              src="/bookmarks/icon-test.png"
            />
          </ListItemIcon>
          <ListItemText>Home</ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem onClick={() => go("/pages/games/chess")}>
          <ListItemIcon>
            <Image alt="" width={20} height={20} src="/bookmarks/queen.png" />
          </ListItemIcon>
          <ListItemText>Chess</ListItemText>
        </MenuItem>

        <MenuItem onClick={() => go("/pages/games/words")}>
          <ListItemIcon>
            <Image alt="" width={20} height={20} src="/bookmarks/omega.png" />
          </ListItemIcon>
          <ListItemText>Words</ListItemText>
        </MenuItem>

        <MenuItem onClick={() => go("/pages/games/numbers")}>
          <ListItemIcon>
            <Image alt="" width={20} height={20} src="/bookmarks/number.png" />
          </ListItemIcon>
          <ListItemText>Numbers</ListItemText>
        </MenuItem>

        <MenuItem onClick={() => go("/pages/games/tetris")}>
          <ListItemIcon>
            <Image alt="" width={20} height={20} src="/bookmarks/tetris.png" />
          </ListItemIcon>
          <ListItemText>Tetris</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};

export default MainMenu;
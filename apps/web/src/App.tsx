import { useEffect } from "react";
import { Toast } from "./components/Toast.js";
import { Lobby } from "./screens/Lobby.js";
import { Playback } from "./screens/Playback.js";
import { Result } from "./screens/Result.js";
import { RoomLobby } from "./screens/RoomLobby.js";
import { Run } from "./screens/Run.js";
import { Settle } from "./screens/Settle.js";
import { StadiumPick } from "./screens/StadiumPick.js";
import { useRun } from "./store/run.js";
import { useSession } from "./store/session.js";

export function App() {
  const state = useRun((s) => s.state);
  const room = useRun((s) => s.room);
  const load = useSession((s) => s.load);
  useEffect(() => { void load(); }, [load]);
  let screen: JSX.Element;
  if (room && !state) screen = <RoomLobby />;
  else if (!state) screen = <Lobby />;
  else if (state.phase === "STADIUM") screen = <StadiumPick />;
  else if (state.phase === "PLAYBACK") screen = <Playback />;
  else if (state.phase === "SETTLE") screen = <Settle />;
  else if (state.phase === "GAME_OVER") screen = <Result />;
  else screen = <Run />;
  return (
    <div className="mx-auto h-full max-w-md bg-slate-950 text-slate-100">
      {screen}
      <Toast />
    </div>
  );
}

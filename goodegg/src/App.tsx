import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { LandingScreen } from './features/landing/LandingScreen'
import { CreateGroupScreen } from './features/groups/CreateGroupScreen'
import { InviteShareScreen } from './features/groups/InviteShareScreen'
import { JoinCodeScreen } from './features/join/JoinCodeScreen'
import { JoinInviteScreen } from './features/join/JoinInviteScreen'
import { BuddyProfileScreen } from './features/profile/BuddyProfileScreen'
import { HomeScreen } from './features/home/HomeScreen'
import { RevealScreen } from './features/reveal/RevealScreen'
import { BuddyViewScreen } from './features/buddy/BuddyViewScreen'
import { IdeasScreen } from './features/ideas/IdeasScreen'
import { AskScreen } from './features/questions/AskScreen'
import { AccompliceScreen } from './features/accomplice/AccompliceScreen'
import { MissionsScreen } from './features/missions/MissionsScreen'
import { InboxScreen } from './features/inbox/InboxScreen'
import { ProfileScreen } from './features/profile/ProfileScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { OrganiserHome } from './features/organiser/OrganiserHome'
import { ParticipantsScreen } from './features/organiser/ParticipantsScreen'
import { GroupSettingsScreen } from './features/organiser/GroupSettingsScreen'
import { MissionsAdminScreen } from './features/organiser/MissionsAdminScreen'

export default function App() {
  return (
    <Routes>
      {/* Onboarding — no app chrome */}
      <Route path="/" element={<LandingScreen />} />
      <Route path="/create" element={<CreateGroupScreen />} />
      <Route path="/join" element={<JoinCodeScreen />} />
      <Route path="/join/:code" element={<JoinInviteScreen />} />
      <Route path="/onboard/:groupId/profile" element={<BuddyProfileScreen mode="onboard" />} />

      {/* Organiser — wider, desktop-friendly */}
      <Route path="/hq" element={<OrganiserHome />} />
      <Route path="/hq/invite/:groupId" element={<InviteShareScreen />} />
      <Route path="/hq/participants" element={<ParticipantsScreen />} />
      <Route path="/hq/settings" element={<GroupSettingsScreen />} />
      <Route path="/hq/missions" element={<MissionsAdminScreen />} />

      {/* Participant app — mobile column + bottom nav */}
      <Route path="/app" element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        <Route path="reveal" element={<RevealScreen />} />
        <Route path="buddy" element={<BuddyViewScreen />} />
        <Route path="ideas" element={<IdeasScreen />} />
        <Route path="ask" element={<AskScreen />} />
        <Route path="accomplice" element={<AccompliceScreen />} />
        <Route path="missions" element={<MissionsScreen />} />
        <Route path="messages" element={<InboxScreen />} />
        <Route path="profile" element={<ProfileScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

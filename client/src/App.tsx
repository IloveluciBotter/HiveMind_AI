import { Route, Switch } from "wouter";
import { TopBar } from "@/components/TopBar";
import { Navigation } from "@/components/Navigation";
import { TokenGate } from "@/components/TokenGate";
import { TrainPage } from "@/pages/TrainPage";
import { ChatPage } from "@/pages/ChatPage";
import { CorpusPage } from "@/pages/CorpusPage";
import { CorpusAdminPage } from "@/pages/CorpusAdminPage";
import StatusPage from "@/pages/StatusPage";
import LegalPage from "@/pages/LegalPage";
import { useWallet } from "@/hooks/useWallet";
import { useIntelligence } from "@/hooks/useIntelligence";

function App() {
  const { wallet, loading, connect, disconnect } = useWallet();
  const { level, addXp, loseXp } = useIntelligence();

  const handleCorrectAnswer = () => {
    addXp(25);
  };

  const handleWrongAnswer = () => {
    loseXp(10);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <TopBar
        intelligenceLevel={level}
        walletConnected={wallet.connected}
        publicKey={wallet.publicKey}
        hiveBalance={wallet.hiveBalance}
        requiredHive={wallet.requiredHive}
        hasAccess={wallet.hasAccess}
        onConnect={connect}
        onDisconnect={disconnect}
        loading={loading}
      />
      <Navigation isCreator={wallet.isCreator} hasAccess={wallet.hasAccess} />

      <main>
        <Switch>
          <Route path="/">
            <TokenGate
              connected={wallet.connected}
              hasAccess={wallet.hasAccess}
              hiveBalance={wallet.hiveBalance}
              requiredHive={wallet.requiredHive}
              onConnect={connect}
            >
              <TrainPage
                intelligenceLevel={level}
                onCorrectAnswer={handleCorrectAnswer}
                onWrongAnswer={handleWrongAnswer}
              />
            </TokenGate>
          </Route>

          <Route path="/chat">
            <TokenGate
              connected={wallet.connected}
              hasAccess={wallet.hasAccess}
              hiveBalance={wallet.hiveBalance}
              requiredHive={wallet.requiredHive}
              onConnect={connect}
            >
              <ChatPage intelligenceLevel={level} />
            </TokenGate>
          </Route>

          <Route path="/corpus">
            <CorpusPage
              authenticated={wallet.authenticated}
              hasAccess={wallet.hasAccess}
            />
          </Route>

          <Route path="/corpus/admin">
            <TokenGate
              connected={wallet.connected}
              hasAccess={wallet.hasAccess}
              hiveBalance={wallet.hiveBalance}
              requiredHive={wallet.requiredHive}
              onConnect={connect}
            >
              <CorpusAdminPage isCreator={wallet.isCreator} />
            </TokenGate>
          </Route>

          <Route path="/status">
            <StatusPage />
          </Route>

          <Route path="/terms">
            <LegalPage type="terms" />
          </Route>

          <Route path="/privacy">
            <LegalPage type="privacy" />
          </Route>

          <Route path="/risk">
            <LegalPage type="risk" />
          </Route>

          <Route path="/contact">
            <LegalPage type="contact" />
          </Route>

          <Route>
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <h1 className="text-4xl font-bold mb-4">404</h1>
                <p className="text-gray-400">Page not found</p>
              </div>
            </div>
          </Route>
        </Switch>
      </main>
    </div>
  );
}

export default App;

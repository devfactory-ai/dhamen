import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompanies } from '../hooks/use-companies';
import { useBatches, useCreateBatch } from '../hooks/use-batches';
import { useAgentContext } from '../stores/agent-context';
import { getUser } from '@/lib/auth';

export default function SelectContextPage() {
  const navigate = useNavigate();
  const { selectedCompany, setCompany, setBatch, setUserId } = useAgentContext();
  const currentUser = getUser();
  const [search, setSearch] = useState('');
  const [newBatchName, setNewBatchName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { data: companiesData, isLoading: companiesLoading } = useCompanies(search || undefined);
  const { data: batchesData, isLoading: batchesLoading } = useBatches(selectedCompany?.id ?? null);
  const createBatch = useCreateBatch();

  const companies = companiesData ?? [];
  const batches = batchesData ?? [];

  function handleSelectCompany(company: { id: string; name: string; matricule_fiscal: string }) {
    setCompany({
      id: company.id,
      name: company.name,
      matriculeFiscal: company.matricule_fiscal,
    });
    setShowCreateForm(false);
    setNewBatchName('');
  }

  function handleSelectBatch(batch: { id: string; name: string; status: string; company_id: string }) {
    if (currentUser) setUserId(currentUser.id);
    setBatch({
      id: batch.id,
      name: batch.name,
      status: batch.status,
      companyId: batch.company_id,
    });
    navigate('/bulletins/saisie');
  }

  async function handleCreateBatch() {
    if (!newBatchName.trim() || !selectedCompany) return;

    const result = await createBatch.mutateAsync({
      name: newBatchName.trim(),
      companyId: selectedCompany.id,
    });

    if (currentUser) setUserId(currentUser.id);
    setBatch({
      id: result.id,
      name: result.name,
      status: result.status,
      companyId: result.companyId,
    });

    navigate('/bulletins/saisie');
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Selection du contexte de travail</h1>
        <p className="mt-1 text-muted-foreground">
          Choisissez l'entreprise et le lot sur lequel vous allez travailler.
        </p>
      </div>

      {/* Step 1: Company selection or Individual mode */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">
          {selectedCompany ? (
            <span className="flex items-center gap-2">
              {selectedCompany.id === '__INDIVIDUAL__' ? 'Mode :' : 'Entreprise :'}
              <span className="text-primary">{selectedCompany.id === '__INDIVIDUAL__' ? 'Contrats Individuels' : selectedCompany.name}</span>
              <button
                type="button"
                onClick={() => setCompany(null)}
                className="text-sm font-normal text-muted-foreground underline hover:text-foreground"
              >
                Changer
              </button>
            </span>
          ) : (
            'Etape 1 — Selectionnez un mode de travail'
          )}
        </h2>

        {!selectedCompany && (
          <>
            {/* Mode individuel card */}
            <button
              type="button"
              onClick={() => {
                setCompany({
                  id: '__INDIVIDUAL__',
                  name: 'Contrats Individuels',
                  matriculeFiscal: '000000000',
                });
              }}
              className="flex w-full items-center gap-4 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/50 p-4 text-left transition-colors hover:bg-blue-100/60 hover:border-blue-400"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-blue-900">Mode Individuel</p>
                <p className="text-sm text-blue-600">Adherents avec contrats individuels (sans entreprise)</p>
              </div>
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">ou selectionnez une entreprise</span>
              </div>
            </div>

            <input
              type="text"
              placeholder="Rechercher par nom ou matricule fiscal..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />

            {companiesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : companies.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">Aucune entreprise trouvee.</p>
            ) : (
              <div className="grid gap-2">
                {companies.filter((c) => c.id !== '__INDIVIDUAL__').map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => handleSelectCompany(company)}
                    className="flex items-center justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
                  >
                    <div>
                      <p className="font-medium">{company.name}</p>
                      <p className="text-sm text-muted-foreground">MF: {company.matricule_fiscal}</p>
                    </div>
                    {company.city && (
                      <span className="text-sm text-muted-foreground">{company.city}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Continue without batch */}
      {selectedCompany && (
        <div className="flex items-center justify-between rounded-lg border bg-card p-4">
          <div>
            <p className="font-medium">Continuer sans lot</p>
            <p className="text-sm text-muted-foreground">
              Acceder aux adherents, contrats et autres fonctionnalites. Le lot est requis uniquement pour la saisie de bulletins.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (currentUser) setUserId(currentUser.id);
              navigate('/');
            }}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Continuer
          </button>
        </div>
      )}

      {/* Step 2: Batch selection (group mode only) */}
      {selectedCompany && selectedCompany.id !== '__INDIVIDUAL__' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Etape 2 — Selectionnez un lot (optionnel)</h2>
            <button
              type="button"
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {showCreateForm ? 'Annuler' : 'Nouveau lot'}
            </button>
          </div>

          {showCreateForm && (
            <div className="flex gap-2 rounded-lg border bg-card p-4">
              <input
                type="text"
                placeholder="Nom du lot (ex: Lot Mars 2026)"
                value={newBatchName}
                onChange={(e) => setNewBatchName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateBatch()}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={handleCreateBatch}
                disabled={!newBatchName.trim() || createBatch.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {createBatch.isPending ? 'Création...' : 'Créer'}
              </button>
            </div>
          )}

          {batchesLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : batches.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              Aucun lot ouvert. Créez un nouveau lot pour commencer.
            </p>
          ) : (
            <div className="grid gap-2">
              {batches.map((batch) => (
                <button
                  key={batch.id}
                  type="button"
                  onClick={() => handleSelectBatch(batch)}
                  className="flex items-center justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
                >
                  <div>
                    <p className="font-medium">{batch.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {batch.bulletins_count} bulletin(s) — {(batch.total_amount / 1000).toFixed(3)} TND
                    </p>
                  </div>
                  <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                    {batch.status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

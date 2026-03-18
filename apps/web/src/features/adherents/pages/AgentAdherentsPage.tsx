import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Users, Eye, FileText, UserPlus, Pencil, Trash2 } from 'lucide-react';
import { useAgentContext } from '@/features/agent/stores/agent-context';
import {
  useAdherents,
  useAdherentBulletins,
  useCreateAdherent,
  useUpdateAdherent,
  useDeleteAdherent,
  useNextMatricule,
  type AdherentBulletin,
  type CreateAdherentData,
  type UpdateAdherentData,
} from '../hooks/useAdherents';

// --- Constants ---

const bulletinStatusConfig: Record<string, { label: string; variant: 'secondary' | 'default' | 'outline' | 'destructive'; className?: string }> = {
  draft: { label: 'Brouillon', variant: 'secondary' },
  in_batch: { label: 'Dans un lot', variant: 'default' },
  exported: { label: 'Exporté', variant: 'outline' },
  soumis: { label: 'Soumis', variant: 'default' },
  en_examen: { label: 'En examen', variant: 'default', className: 'bg-yellow-500 hover:bg-yellow-600' },
  approuve: { label: 'Approuvé', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  rejete: { label: 'Rejeté', variant: 'destructive' },
  paye: { label: 'Payé', variant: 'default', className: 'bg-emerald-700 hover:bg-emerald-800' },
};

const ETAT_CIVIL_OPTIONS = [
  { value: 'celibataire', label: 'Célibataire' },
  { value: 'marie', label: 'Marié(e)' },
  { value: 'divorce', label: 'Divorcé(e)' },
  { value: 'veuf', label: 'Veuf(ve)' },
];

// Les 24 gouvernorats de Tunisie
const GOUVERNORATS_TUNISIE = [
  'Tunis', 'Ariana', 'Ben Arous', 'Manouba',
  'Nabeul', 'Zaghouan', 'Bizerte', 'Béja',
  'Jendouba', 'Le Kef', 'Siliana', 'Sousse',
  'Monastir', 'Mahdia', 'Sfax', 'Kairouan',
  'Kasserine', 'Sidi Bouzid', 'Gabès', 'Médenine',
  'Tataouine', 'Gafsa', 'Tozeur', 'Kébili',
];

// --- Types ---

interface AgentAdherent {
  id: string;
  matricule: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  email: string | null;
  city: string | null;
  companyId: string | null;
  companyName: string | null;
  plafondGlobal: number | null;
  plafondConsomme: number | null;
  ayantsDroitJson: string | null;
  createdAt: string;
}

// --- Helpers ---

function formatAmount(amount: number | null): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 0 }).format(amount / 1000) + ' DT';
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-TN');
}

// --- Form State ---

interface AdherentFormState {
  // Onglet Adhérent (identité)
  typePieceIdentite: string;
  nationalId: string;
  dateEditionPiece: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  lieuNaissance: string;
  etatCivil: string;
  dateMarriage: string;
  // Onglet Adhérent (couverture)
  matricule: string;
  plafondGlobal: string;
  dateDebutAdhesion: string;
  dateFinAdhesion: string;
  rang: string;
  isActive: boolean;
  contreVisiteObligatoire: boolean;
  etatFiche: string;
  // Onglet Renseignement (contact)
  phone: string;
  mobile: string;
  email: string;
  // Onglet Renseignement (adresse)
  rue: string;
  address: string;
  city: string;
  postalCode: string;
  // Onglet Renseignement (complémentaire)
  banque: string;
  rib: string;
  regimeSocial: string;
  handicap: boolean;
  fonction: string;
  maladiChronique: boolean;
  matriculeConjoint: string;
  credit: string;
}

const emptyForm: AdherentFormState = {
  typePieceIdentite: 'CIN', nationalId: '', dateEditionPiece: '',
  firstName: '', lastName: '', dateOfBirth: '',
  gender: '', lieuNaissance: '', etatCivil: '', dateMarriage: '',
  matricule: '', plafondGlobal: '', dateDebutAdhesion: '', dateFinAdhesion: '', rang: '0', isActive: true,
  contreVisiteObligatoire: false, etatFiche: 'NON_TEMPORAIRE',
  phone: '', mobile: '', email: '',
  rue: '', address: '', city: '', postalCode: '',
  banque: '', rib: '', regimeSocial: '', handicap: false, fonction: '', maladiChronique: false, matriculeConjoint: '',
  credit: '',
};

// --- Sub-components ---

function BulletinHistory({ adherentId }: { adherentId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdherentBulletins(adherentId, page, 5);
  const bulletins: AdherentBulletin[] = data?.data ?? [];
  const meta = data?.meta;

  if (isLoading) return <p className="text-sm text-gray-400 py-4">Chargement...</p>;
  if (!bulletins.length) {
    return (
      <div className="text-center py-6 text-gray-400">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Aucun bulletin de soins</p>
      </div>
    );
  }

  const totalDeclared = bulletins.reduce((s, b) => s + (Number(b.declaredAmount) || 0), 0);
  const totalReimbursed = bulletins.reduce((s, b) => s + (Number(b.reimbursedAmount) || 0), 0);

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500">
            <th className="py-2">Date</th><th>Statut</th><th className="text-right">Déclaré</th><th className="text-right">Remboursé</th><th className="text-right">Actes</th>
          </tr>
        </thead>
        <tbody>
          {bulletins.map((b) => {
            const cfg = bulletinStatusConfig[b.status] || { label: b.status, variant: 'outline' as const };
            return (
              <tr key={b.id} className="border-b last:border-0">
                <td className="py-2">{formatDate(b.dateSoins)}</td>
                <td><Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge></td>
                <td className="text-right">{formatAmount(b.declaredAmount)}</td>
                <td className="text-right font-medium">{formatAmount(b.reimbursedAmount)}</td>
                <td className="text-right">{b.actesCount}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t font-medium text-sm">
            <td colSpan={2} className="py-2">Total</td>
            <td className="text-right">{formatAmount(totalDeclared)}</td>
            <td className="text-right">{formatAmount(totalReimbursed)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {meta && meta.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-3">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Précédent</Button>
          <span className="text-xs text-gray-500 self-center">{page} / {meta.totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Suivant</Button>
        </div>
      )}
    </div>
  );
}

/** Form tabs: Adhérent + Renseignement (matches Acorad layout) */
function AdherentFormTabs({
  form, setForm, formErrors, isEdit,
}: {
  form: AdherentFormState;
  setForm: (f: AdherentFormState) => void;
  formErrors: Record<string, string>;
  isEdit: boolean;
}) {
  return (
    <Tabs defaultValue="adherent" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="adherent">Adhérent</TabsTrigger>
        <TabsTrigger value="renseignement">Renseignement</TabsTrigger>
      </TabsList>

      {/* === Onglet Adhérent === */}
      <TabsContent value="adherent" className="space-y-4 mt-4">
        {/* Type piece identite / N° piece / Date edition */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Type de piece</Label>
            <Select value={form.typePieceIdentite} onValueChange={(v) => setForm({ ...form, typePieceIdentite: v })}>
              <SelectTrigger><SelectValue placeholder="CIN" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CIN">Carte d'Identite Nationale</SelectItem>
                <SelectItem value="PASSEPORT">Passeport</SelectItem>
                <SelectItem value="CARTE_SEJOUR">Carte de sejour</SelectItem>
                <SelectItem value="AUTRE">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="nationalId">N° piece</Label>
            <Input
              id="nationalId"
              placeholder="12345678"
              maxLength={form.typePieceIdentite === 'CIN' ? 8 : 20}
              disabled={isEdit}
              value={form.nationalId}
              onChange={(e) => setForm({ ...form, nationalId: form.typePieceIdentite === 'CIN' ? e.target.value.replace(/\D/g, '') : e.target.value })}
            className={formErrors.nationalId ? 'border-red-500' : ''}
          />
          {formErrors.nationalId && <p className="text-xs text-red-500 mt-1">{formErrors.nationalId}</p>}
          </div>
          <div>
            <Label htmlFor="dateEditionPiece">Date d'edition</Label>
            <Input id="dateEditionPiece" type="date" value={form.dateEditionPiece} onChange={(e) => setForm({ ...form, dateEditionPiece: e.target.value })} />
          </div>
        </div>

        {/* Nom / Prénom */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="lastName">Nom *</Label>
            <Input id="lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={formErrors.lastName ? 'border-red-500' : ''} />
            {formErrors.lastName && <p className="text-xs text-red-500 mt-1">{formErrors.lastName}</p>}
          </div>
          <div>
            <Label htmlFor="firstName">Prénom *</Label>
            <Input id="firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={formErrors.firstName ? 'border-red-500' : ''} />
            {formErrors.firstName && <p className="text-xs text-red-500 mt-1">{formErrors.firstName}</p>}
          </div>
        </div>

        {/* Date naissance / Lieu naissance */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="dateOfBirth">Date de naissance *</Label>
            <Input id="dateOfBirth" type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className={formErrors.dateOfBirth ? 'border-red-500' : ''} />
            {formErrors.dateOfBirth && <p className="text-xs text-red-500 mt-1">{formErrors.dateOfBirth}</p>}
          </div>
          <div>
            <Label>Lieu de naissance</Label>
            <Select value={form.lieuNaissance} onValueChange={(v) => setForm({ ...form, lieuNaissance: v })}>
              <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
              <SelectContent>
                {GOUVERNORATS_TUNISIE.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Sexe / Etat civil / Date mariage */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Sexe</Label>
            <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="M">Masculin</SelectItem>
                <SelectItem value="F">Féminin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Etat civil</Label>
            <Select value={form.etatCivil} onValueChange={(v) => setForm({ ...form, etatCivil: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {ETAT_CIVIL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="dateMarriage">Date mariage</Label>
            <Input id="dateMarriage" type="date" value={form.dateMarriage} onChange={(e) => setForm({ ...form, dateMarriage: e.target.value })} />
          </div>
        </div>

        {/* Matricule / Plafond */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="matricule">Matricule</Label>
            <Input id="matricule" placeholder="001" value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="plafondGlobal">Plafond (DT)</Label>
            <Input id="plafondGlobal" type="number" min={0} placeholder="6000" value={form.plafondGlobal} onChange={(e) => setForm({ ...form, plafondGlobal: e.target.value })} />
          </div>
        </div>

        {/* Dates adhésion / Rang / Actif */}
        <div className="grid grid-cols-4 gap-3">
          <div>
            <Label htmlFor="dateDebutAdhesion">Début adhésion</Label>
            <Input id="dateDebutAdhesion" type="date" value={form.dateDebutAdhesion} onChange={(e) => setForm({ ...form, dateDebutAdhesion: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="dateFinAdhesion">Fin adhésion</Label>
            <Input id="dateFinAdhesion" type="date" value={form.dateFinAdhesion} onChange={(e) => setForm({ ...form, dateFinAdhesion: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="rang">Rang</Label>
            <Input id="rang" type="number" min={0} value={form.rang} onChange={(e) => setForm({ ...form, rang: e.target.value })} />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded" />
              <span className="text-sm font-medium">Actif</span>
            </label>
          </div>
        </div>

        {/* Contre-visite / Etat fiche */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.contreVisiteObligatoire} onChange={(e) => setForm({ ...form, contreVisiteObligatoire: e.target.checked })} className="rounded" />
              <span className="text-sm">Contre-visite obligatoire</span>
            </label>
          </div>
          <div>
            <Label>Etat de fiche</Label>
            <Select value={form.etatFiche} onValueChange={(v) => setForm({ ...form, etatFiche: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NON_TEMPORAIRE">Non temporaire</SelectItem>
                <SelectItem value="TEMPORAIRE">Temporaire</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="credit">Credit (DT)</Label>
            <Input id="credit" type="number" min={0} step="0.001" placeholder="0" value={form.credit} onChange={(e) => setForm({ ...form, credit: e.target.value })} />
          </div>
        </div>
      </TabsContent>

      {/* === Onglet Renseignement === */}
      <TabsContent value="renseignement" className="space-y-4 mt-4">
        {/* Adresse */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="rue">Rue</Label>
            <Input id="rue" value={form.rue} onChange={(e) => setForm({ ...form, rue: e.target.value })} />
          </div>
          <div>
            <Label>Gouvernorat</Label>
            <Select value={form.city} onValueChange={(v) => setForm({ ...form, city: v })}>
              <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
              <SelectContent>
                {GOUVERNORATS_TUNISIE.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="postalCode">CP</Label>
            <Input id="postalCode" maxLength={4} value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
          </div>
        </div>
        <div>
          <Label htmlFor="address">Adresse complète</Label>
          <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={formErrors.email ? 'border-red-500' : ''} />
            {formErrors.email && <p className="text-xs text-red-500 mt-1">{formErrors.email}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={formErrors.phone ? 'border-red-500' : ''} />
              {formErrors.phone && <p className="text-xs text-red-500 mt-1">{formErrors.phone}</p>}
            </div>
            <div>
              <Label htmlFor="mobile">Mobile</Label>
              <Input id="mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Banque / RIB */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="banque">Banque</Label>
            <Input id="banque" value={form.banque} onChange={(e) => setForm({ ...form, banque: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="rib">RIB</Label>
            <Input id="rib" placeholder="12345678901234567890" value={form.rib} onChange={(e) => setForm({ ...form, rib: e.target.value })} />
          </div>
        </div>

        {/* Régime social / Fonction */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>CNSS / CNRPS</Label>
            <Select value={form.regimeSocial} onValueChange={(v) => setForm({ ...form, regimeSocial: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CNSS">CNSS</SelectItem>
                <SelectItem value="CNRPS">CNRPS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="fonction">Fonction / Qualification</Label>
            <Input id="fonction" value={form.fonction} onChange={(e) => setForm({ ...form, fonction: e.target.value })} />
          </div>
        </div>

        {/* Handicap / Maladie chronique / Matricule conjoint */}
        <div className="grid grid-cols-3 gap-3">
          <label className="flex items-center gap-2 cursor-pointer pt-5">
            <input type="checkbox" checked={form.handicap} onChange={(e) => setForm({ ...form, handicap: e.target.checked })} className="rounded" />
            <span className="text-sm">Handicap</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer pt-5">
            <input type="checkbox" checked={form.maladiChronique} onChange={(e) => setForm({ ...form, maladiChronique: e.target.checked })} className="rounded" />
            <span className="text-sm">Maladie chronique</span>
          </label>
          <div>
            <Label htmlFor="matriculeConjoint">Matricule conjoint</Label>
            <Input id="matriculeConjoint" value={form.matriculeConjoint} onChange={(e) => setForm({ ...form, matriculeConjoint: e.target.value })} />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}

// --- Main Page ---

export function AgentAdherentsPage() {
  const { selectedCompany } = useAgentContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [viewAdherent, setViewAdherent] = useState<AgentAdherent | null>(null);
  const [showBulletins, setShowBulletins] = useState(false);

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editAdherent, setEditAdherent] = useState<AgentAdherent | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AgentAdherent | null>(null);

  const [form, setForm] = useState<AdherentFormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data, isLoading } = useAdherents(page, 20, search || undefined, selectedCompany?.id);
  const { data: nextMatricule } = useNextMatricule(selectedCompany?.id);
  const createMutation = useCreateAdherent();
  const updateMutation = useUpdateAdherent();
  const deleteMutation = useDeleteAdherent();

  const adherents: AgentAdherent[] = (data?.data as unknown as AgentAdherent[]) ?? [];
  const meta = data?.meta;

  // --- Columns ---
  const columns = [
    { key: 'matricule', header: 'Matricule', render: (item: AgentAdherent) => <span className="font-mono text-xs">{item.matricule || '—'}</span> },
    { key: 'lastName', header: 'Nom' },
    { key: 'firstName', header: 'Prénom' },
    { key: 'companyName', header: 'Entreprise', render: (item: AgentAdherent) => item.companyName || '—' },
    {
      key: 'plafond',
      header: 'Plafond',
      render: (item: AgentAdherent) => {
        const global = Number(item.plafondGlobal) || 0;
        const consomme = Number(item.plafondConsomme) || 0;
        const pct = global > 0 ? Math.round((consomme / global) * 100) : 0;
        return (
          <div className="w-28">
            <div className="flex justify-between text-xs mb-1">
              <span>{pct}%</span>
              <span className="text-gray-400">{formatAmount(global)}</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-orange-400' : 'bg-green-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      render: (item: AgentAdherent) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setViewAdherent(item); setShowBulletins(false); }}><Eye className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEditDialog(item); }}><Pencil className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item); }}><Trash2 className="w-4 h-4" /></Button>
        </div>
      ),
    },
  ];

  // --- Form logic ---

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!editAdherent && form.nationalId) {
      if (form.typePieceIdentite === 'CIN' && !/^\d{8}$/.test(form.nationalId)) {
        errors.nationalId = 'CIN invalide (8 chiffres requis)';
      }
    }
    if (!form.lastName.trim()) errors.lastName = 'Nom requis';
    if (!form.firstName.trim()) errors.firstName = 'Prénom requis';
    if (!form.dateOfBirth) errors.dateOfBirth = 'Date de naissance requise';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Email invalide';
    if (form.phone && !/^\d{8}$/.test(form.phone.replace(/\s/g, ''))) errors.phone = 'Numéro invalide (8 chiffres)';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function openEditDialog(item: AgentAdherent) {
    setEditAdherent(item);
    setForm({
      ...emptyForm,
      nationalId: '', // CIN not editable
      firstName: item.firstName || '',
      lastName: item.lastName || '',
      dateOfBirth: item.dateOfBirth || '',
      gender: item.gender || '',
      matricule: item.matricule || '',
      plafondGlobal: item.plafondGlobal ? String(item.plafondGlobal / 1000) : '',
      email: item.email || '',
      city: item.city || '',
      isActive: true,
    });
    setFormErrors({});
  }

  async function handleCreate() {
    if (!validateForm() || !selectedCompany) return;
    const payload: CreateAdherentData = {
      nationalId: form.nationalId,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      dateOfBirth: form.dateOfBirth,
      gender: form.gender || undefined,
      lieuNaissance: form.lieuNaissance || undefined,
      etatCivil: form.etatCivil || undefined,
      dateMarriage: form.dateMarriage || undefined,
      phone: form.phone || undefined,
      mobile: form.mobile || undefined,
      email: form.email || undefined,
      rue: form.rue || undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      postalCode: form.postalCode || undefined,
      companyId: selectedCompany.id,
      matricule: form.matricule || undefined,
      plafondGlobal: form.plafondGlobal ? Number(form.plafondGlobal) * 1000 : undefined,
      dateDebutAdhesion: form.dateDebutAdhesion || undefined,
      dateFinAdhesion: form.dateFinAdhesion || undefined,
      rang: form.rang ? Number(form.rang) : undefined,
      isActive: form.isActive,
      banque: form.banque || undefined,
      rib: form.rib || undefined,
      regimeSocial: form.regimeSocial || undefined,
      handicap: form.handicap || undefined,
      fonction: form.fonction || undefined,
      maladiChronique: form.maladiChronique || undefined,
      matriculeConjoint: form.matriculeConjoint || undefined,
      typePieceIdentite: form.typePieceIdentite || undefined,
      dateEditionPiece: form.dateEditionPiece || undefined,
      contreVisiteObligatoire: form.contreVisiteObligatoire || undefined,
      etatFiche: form.etatFiche || undefined,
      credit: form.credit ? Number(form.credit) : undefined,
    };
    try {
      await createMutation.mutateAsync(payload);
      setShowCreateDialog(false);
      setForm(emptyForm);
      setFormErrors({});
    } catch { /* handled by mutation */ }
  }

  async function handleUpdate() {
    if (!validateForm() || !editAdherent) return;
    const payload: UpdateAdherentData = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      dateOfBirth: form.dateOfBirth || undefined,
      gender: form.gender || undefined,
      lieuNaissance: form.lieuNaissance || undefined,
      etatCivil: form.etatCivil || undefined,
      dateMarriage: form.dateMarriage || undefined,
      phone: form.phone || undefined,
      mobile: form.mobile || undefined,
      email: form.email || undefined,
      rue: form.rue || undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      postalCode: form.postalCode || undefined,
      matricule: form.matricule || undefined,
      plafondGlobal: form.plafondGlobal ? Number(form.plafondGlobal) * 1000 : undefined,
      dateDebutAdhesion: form.dateDebutAdhesion || undefined,
      dateFinAdhesion: form.dateFinAdhesion || undefined,
      rang: form.rang ? Number(form.rang) : undefined,
      isActive: form.isActive,
      banque: form.banque || undefined,
      rib: form.rib || undefined,
      regimeSocial: form.regimeSocial || undefined,
      handicap: form.handicap || undefined,
      fonction: form.fonction || undefined,
      maladiChronique: form.maladiChronique || undefined,
      matriculeConjoint: form.matriculeConjoint || undefined,
      typePieceIdentite: form.typePieceIdentite || undefined,
      dateEditionPiece: form.dateEditionPiece || undefined,
      contreVisiteObligatoire: form.contreVisiteObligatoire || undefined,
      etatFiche: form.etatFiche || undefined,
      credit: form.credit ? Number(form.credit) : undefined,
    };
    try {
      await updateMutation.mutateAsync({ id: editAdherent.id, data: payload });
      setEditAdherent(null);
      setForm(emptyForm);
      setFormErrors({});
    } catch { /* handled by mutation */ }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    try {
      await deleteMutation.mutateAsync(deleteConfirm.id);
      setDeleteConfirm(null);
      if (viewAdherent?.id === deleteConfirm.id) setViewAdherent(null);
    } catch { /* handled by mutation */ }
  }

  // --- Detail dialog helpers ---
  let ayantsDroit: { nom: string; prenom: string; lien: string }[] = [];
  if (viewAdherent?.ayantsDroitJson) {
    try { ayantsDroit = JSON.parse(viewAdherent.ayantsDroitJson); } catch { /* ignore */ }
  }
  const plafondGlobal = Number(viewAdherent?.plafondGlobal) || 0;
  const plafondConsomme = Number(viewAdherent?.plafondConsomme) || 0;
  const plafondRestant = Math.max(0, plafondGlobal - plafondConsomme);
  const plafondPct = plafondGlobal > 0 ? Math.round((plafondConsomme / plafondGlobal) * 100) : 0;

  const isFormBusy = createMutation.isPending || updateMutation.isPending;
  const formError = createMutation.error || updateMutation.error;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Adhérents"
        description={selectedCompany ? `Entreprise : ${selectedCompany.name}` : 'Sélectionnez une entreprise'}
      />

      {/* Search + Create */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Rechercher par nom ou matricule..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
        </div>
        <Button onClick={() => { setForm({ ...emptyForm, matricule: nextMatricule || '0001' }); setFormErrors({}); setShowCreateDialog(true); }} disabled={!selectedCompany}>
          <UserPlus className="w-4 h-4 mr-2" />Nouvel adhérent
        </Button>
      </div>

      {/* Table */}
      <DataTable columns={columns} data={adherents} isLoading={isLoading} emptyMessage="Aucun adhérent trouvé" onRowClick={(item) => { setViewAdherent(item); setShowBulletins(false); }} />

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">{meta.total} adhérent(s)</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Précédent</Button>
            <span className="text-sm self-center">{page} / {meta.totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Suivant</Button>
          </div>
        </div>
      )}

      {/* === Create / Edit Dialog === */}
      <Dialog
        open={showCreateDialog || !!editAdherent}
        onOpenChange={(open) => { if (!open) { setShowCreateDialog(false); setEditAdherent(null); setFormErrors({}); } }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editAdherent ? <><Pencil className="w-5 h-5" /> Modifier l'adhérent</> : <><UserPlus className="w-5 h-5" /> Nouvel adhérent</>}
            </DialogTitle>
          </DialogHeader>

          {/* Entreprise (read-only) */}
          <div className="mb-2">
            <Label className="text-xs text-gray-500">Entreprise</Label>
            <p className="text-sm font-medium">{selectedCompany?.name || '—'}</p>
          </div>

          <AdherentFormTabs form={form} setForm={setForm} formErrors={formErrors} isEdit={!!editAdherent} />

          {formError && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{formError.message}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setEditAdherent(null); setFormErrors({}); }}>Annuler</Button>
            <Button onClick={editAdherent ? handleUpdate : handleCreate} disabled={isFormBusy}>
              {isFormBusy ? 'Enregistrement...' : editAdherent ? 'Mettre à jour' : 'Enregistrer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* === Delete Confirmation === */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'adhérent</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer <strong>{deleteConfirm?.firstName} {deleteConfirm?.lastName}</strong>
              {deleteConfirm?.matricule && <> (matricule: {deleteConfirm.matricule})</>} ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* === Detail Dialog === */}
      <Dialog open={!!viewAdherent} onOpenChange={() => setViewAdherent(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {viewAdherent?.firstName} {viewAdherent?.lastName}
              {viewAdherent?.matricule && <Badge variant="outline" className="font-mono text-xs ml-2">{viewAdherent.matricule}</Badge>}
            </DialogTitle>
          </DialogHeader>

          {viewAdherent && (
            <div className="space-y-5">
              {/* Actions rapides */}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setViewAdherent(null); openEditDialog(viewAdherent); }}>
                  <Pencil className="w-4 h-4 mr-1" /> Modifier
                </Button>
                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setViewAdherent(null); setDeleteConfirm(viewAdherent); }}>
                  <Trash2 className="w-4 h-4 mr-1" /> Supprimer
                </Button>
              </div>

              {/* Informations */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Informations</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">Nom complet</span><p className="font-medium">{viewAdherent.firstName} {viewAdherent.lastName}</p></div>
                  <div><span className="text-gray-500">Date de naissance</span><p className="font-medium">{formatDate(viewAdherent.dateOfBirth)}</p></div>
                  <div><span className="text-gray-500">Sexe</span><p className="font-medium">{viewAdherent.gender === 'M' ? 'Masculin' : viewAdherent.gender === 'F' ? 'Féminin' : '—'}</p></div>
                  <div><span className="text-gray-500">Email</span><p className="font-medium">{viewAdherent.email || '—'}</p></div>
                  <div><span className="text-gray-500">Ville</span><p className="font-medium">{viewAdherent.city || '—'}</p></div>
                  <div><span className="text-gray-500">Matricule</span><p className="font-medium font-mono">{viewAdherent.matricule || '—'}</p></div>
                </div>
              </div>

              {/* Entreprise */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Entreprise</h3>
                <p className="text-sm font-medium">{viewAdherent.companyName || '—'}</p>
              </div>

              {/* Plafond */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Plafond annuel</h3>
                <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-gray-500 text-xs">Global</p><p className="font-semibold">{formatAmount(plafondGlobal)}</p></div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-gray-500 text-xs">Consommé</p><p className="font-semibold text-orange-600">{formatAmount(plafondConsomme)}</p></div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-gray-500 text-xs">Restant</p><p className="font-semibold text-green-600">{formatAmount(plafondRestant)}</p></div>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${plafondPct > 80 ? 'bg-red-500' : plafondPct > 50 ? 'bg-orange-400' : 'bg-green-500'}`} style={{ width: `${Math.min(plafondPct, 100)}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1 text-right">{plafondPct}% consommé</p>
              </div>

              {/* Ayants droit */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Ayants droit</h3>
                {ayantsDroit.length > 0 ? (
                  <div className="space-y-2">
                    {ayantsDroit.map((ad, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                        <span className="font-medium">{ad.prenom} {ad.nom}</span>
                        <Badge variant="outline" className="text-xs">{ad.lien}</Badge>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-400">Aucun ayant droit</p>}
              </div>

              {/* Historique bulletins */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">Historique bulletins</h3>
                  <Button size="sm" variant="outline" onClick={() => setShowBulletins(!showBulletins)}>
                    <FileText className="w-4 h-4 mr-1" />{showBulletins ? 'Masquer' : 'Afficher'}
                  </Button>
                </div>
                {showBulletins && <BulletinHistory adherentId={viewAdherent.id} />}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

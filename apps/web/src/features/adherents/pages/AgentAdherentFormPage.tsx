import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserPlus, Pencil, Save } from 'lucide-react';
import { useAgentContext } from '@/features/agent/stores/agent-context';
import {
  useAdherent,
  useCreateAdherent,
  useUpdateAdherent,
  useNextMatricule,
  type CreateAdherentData,
  type UpdateAdherentData,
} from '../hooks/useAdherents';

// --- Constants ---

const ETAT_CIVIL_OPTIONS = [
  { value: 'celibataire', label: 'Célibataire' },
  { value: 'marie', label: 'Marié(e)' },
  { value: 'divorce', label: 'Divorcé(e)' },
  { value: 'veuf', label: 'Veuf(ve)' },
];

const GOUVERNORATS_TUNISIE = [
  'Tunis', 'Ariana', 'Ben Arous', 'Manouba',
  'Nabeul', 'Zaghouan', 'Bizerte', 'Béja',
  'Jendouba', 'Le Kef', 'Siliana', 'Sousse',
  'Monastir', 'Mahdia', 'Sfax', 'Kairouan',
  'Kasserine', 'Sidi Bouzid', 'Gabès', 'Médenine',
  'Tataouine', 'Gafsa', 'Tozeur', 'Kébili',
];

// --- Form State ---

interface AdherentFormState {
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
  matricule: string;
  plafondGlobal: string;
  dateDebutAdhesion: string;
  dateFinAdhesion: string;
  rang: string;
  isActive: boolean;
  contreVisiteObligatoire: boolean;
  etatFiche: string;
  phone: string;
  mobile: string;
  email: string;
  rue: string;
  address: string;
  city: string;
  postalCode: string;
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

export function AgentAdherentFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const { selectedCompany } = useAgentContext();

  const [form, setForm] = useState<AdherentFormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data: nextMatricule } = useNextMatricule(selectedCompany?.id);
  const createMutation = useCreateAdherent();
  const updateMutation = useUpdateAdherent();

  // Fetch adherent data if editing
  const { data: adherentData } = useAdherent(id || '');

  // Populate form when editing
  useEffect(() => {
    if (adherentData && isEdit) {
      const a = adherentData as unknown as Record<string, unknown>;
      setForm({
        typePieceIdentite: (a.typePieceIdentite as string) || (a.type_piece_identite as string) || 'CIN',
        nationalId: (a.nationalId as string) || (a.national_id as string) || '',
        dateEditionPiece: (a.dateEditionPiece as string) || (a.date_edition_piece as string) || '',
        firstName: (a.firstName as string) || (a.first_name as string) || '',
        lastName: (a.lastName as string) || (a.last_name as string) || '',
        dateOfBirth: (a.dateOfBirth as string) || (a.date_of_birth as string) || '',
        gender: (a.gender as string) || '',
        lieuNaissance: (a.lieuNaissance as string) || (a.lieu_naissance as string) || '',
        etatCivil: (a.etatCivil as string) || (a.etat_civil as string) || '',
        dateMarriage: (a.dateMarriage as string) || (a.date_marriage as string) || '',
        matricule: (a.matricule as string) || '',
        plafondGlobal: a.plafondGlobal ? String(Number(a.plafondGlobal) / 1000) : a.plafond_global ? String(Number(a.plafond_global) / 1000) : '',
        dateDebutAdhesion: (a.dateDebutAdhesion as string) || (a.date_debut_adhesion as string) || '',
        dateFinAdhesion: (a.dateFinAdhesion as string) || (a.date_fin_adhesion as string) || '',
        rang: a.rang ? String(a.rang) : '0',
        isActive: a.isActive !== false && a.is_active !== 0,
        contreVisiteObligatoire: !!(a.contreVisiteObligatoire || a.contre_visite_obligatoire),
        etatFiche: (a.etatFiche as string) || (a.etat_fiche as string) || 'NON_TEMPORAIRE',
        phone: (a.phone as string) || '',
        mobile: (a.mobile as string) || '',
        email: (a.email as string) || '',
        rue: (a.rue as string) || '',
        address: (a.address as string) || '',
        city: (a.city as string) || '',
        postalCode: (a.postalCode as string) || (a.postal_code as string) || '',
        banque: (a.banque as string) || '',
        rib: (a.rib as string) || '',
        regimeSocial: (a.regimeSocial as string) || (a.regime_social as string) || '',
        handicap: !!(a.handicap),
        fonction: (a.fonction as string) || '',
        maladiChronique: !!(a.maladiChronique || a.maladi_chronique),
        matriculeConjoint: (a.matriculeConjoint as string) || (a.matricule_conjoint as string) || '',
        credit: a.credit ? String(a.credit) : '',
      });
    } else if (!isEdit) {
      setForm({ ...emptyForm, matricule: nextMatricule || '0001' });
    }
  }, [adherentData, isEdit, nextMatricule]);

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!isEdit && form.nationalId) {
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

  async function handleSubmit() {
    if (!validateForm()) return;

    if (isEdit && id) {
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
        await updateMutation.mutateAsync({ id, data: payload });
        navigate('/adherents/agent');
      } catch { /* handled by mutation */ }
    } else {
      if (!selectedCompany) return;
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
        navigate('/adherents/agent');
      } catch { /* handled by mutation */ }
    }
  }

  const isBusy = createMutation.isPending || updateMutation.isPending;
  const formError = createMutation.error || updateMutation.error;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? 'Modifier l\'adhérent' : 'Nouvel adhérent'}
        description={
          isEdit
            ? `Modification de ${form.firstName} ${form.lastName}`
            : `Entreprise: ${selectedCompany?.name || '—'}`
        }
        icon={isEdit ? <Pencil className="w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
        breadcrumb={[
          { label: 'Adhérents', href: '/adherents/agent' },
          { label: isEdit ? 'Modifier' : 'Nouveau' },
        ]}
      />

      <Card>
        <CardContent className="pt-6">
          {/* Entreprise (read-only) */}
          <div className="mb-4">
            <Label className="text-xs text-gray-500">Entreprise</Label>
            <p className="text-sm font-medium">
              {selectedCompany?.name || '—'}
            </p>
          </div>

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
                  <Label>Type de pièce</Label>
                  <Select value={form.typePieceIdentite} onValueChange={(v) => setForm({ ...form, typePieceIdentite: v })}>
                    <SelectTrigger><SelectValue placeholder="CIN" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CIN">Carte d'Identité Nationale</SelectItem>
                      <SelectItem value="PASSEPORT">Passeport</SelectItem>
                      <SelectItem value="CARTE_SEJOUR">Carte de séjour</SelectItem>
                      <SelectItem value="AUTRE">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="nationalId">N° pièce</Label>
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
                  <Label htmlFor="dateEditionPiece">Date d'édition</Label>
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
                  <Input id="dateOfBirth" type="date" max={new Date().toISOString().split('T')[0]} value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className={formErrors.dateOfBirth ? 'border-red-500' : ''} />
                  {formErrors.dateOfBirth && <p className="text-xs text-red-500 mt-1">{formErrors.dateOfBirth}</p>}
                </div>
                <div>
                  <Label>Lieu de naissance</Label>
                  <Select value={form.lieuNaissance || 'none'} onValueChange={(v) => setForm({ ...form, lieuNaissance: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sélectionner</SelectItem>
                      {GOUVERNORATS_TUNISIE.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Sexe / Etat civil / Date mariage */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Sexe</Label>
                  <Select value={form.gender || 'none'} onValueChange={(v) => setForm({ ...form, gender: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="M">Masculin</SelectItem>
                      <SelectItem value="F">Féminin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>État civil</Label>
                  <Select value={form.etatCivil || 'none'} onValueChange={(v) => setForm({ ...form, etatCivil: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
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

              {/* Contre-visite / Etat fiche / Credit */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.contreVisiteObligatoire} onChange={(e) => setForm({ ...form, contreVisiteObligatoire: e.target.checked })} className="rounded" />
                    <span className="text-sm">Contre-visite obligatoire</span>
                  </label>
                </div>
                <div>
                  <Label>État de fiche</Label>
                  <Select value={form.etatFiche} onValueChange={(v) => setForm({ ...form, etatFiche: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NON_TEMPORAIRE">Non temporaire</SelectItem>
                      <SelectItem value="TEMPORAIRE">Temporaire</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="credit">Crédit (DT)</Label>
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
                  <Select value={form.city || 'none'} onValueChange={(v) => setForm({ ...form, city: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sélectionner</SelectItem>
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
                  <Select value={form.regimeSocial || 'none'} onValueChange={(v) => setForm({ ...form, regimeSocial: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
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

          {formError && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
              {(formError as Error).message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Actions — sticky bottom bar */}
      <div className="sticky bottom-0 z-10 border-t bg-white/95 backdrop-blur-sm py-4 -mx-6 px-6 flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => navigate('/adherents/agent')}
        >
          Annuler
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isBusy}
          className="gap-2"
        >
          <Save className="w-4 h-4" />
          {isBusy
            ? 'Enregistrement...'
            : isEdit
              ? 'Mettre à jour'
              : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}

export default AgentAdherentFormPage;

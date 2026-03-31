/**
 * SoinFlow Garanties/Formules Page
 *
 * Manage guarantee formulas and coverage rules
 */
import { useState } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  Users,
  Shield,
  Percent,
  Clock,
  DollarSign,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useFormules,
  useFormuleById,
  useCreateFormule,
  useUpdateFormule,
  useDeleteFormule,
  formatMontant,
  formatTaux,
  formatDelaiCarence,
  TYPE_SOIN_OPTIONS,
  type SanteFormule,
  type FormuleDetail,
  type SanteCouverture,
} from '../hooks/useGaranties';

export default function SanteGarantiesPage() {
  const [showInactive, setShowInactive] = useState(false);
  const [selectedFormuleId, setSelectedFormuleId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editFormule, setEditFormule] = useState<SanteFormule | null>(null);

  const { data: formules, isLoading } = useFormules(showInactive);
  const { data: formuleDetail } = useFormuleById(selectedFormuleId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Formules de Garantie"
          description="Gérer les formules et taux de couverture"
        />
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Afficher inactives
          </label>
          <Button className="gap-2 bg-slate-900 hover:bg-[#19355d]" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4" /> Nouvelle formule
          </Button>
        </div>
      </div>

      {/* Formules Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-32 animate-pulse bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {formules?.map((formule) => (
            <FormuleCard
              key={formule.id}
              formule={formule}
              onView={() => setSelectedFormuleId(formule.id)}
              onEdit={() => {
                setEditFormule(formule);
                setIsEditOpen(true);
              }}
            />
          ))}
          {formules?.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Shield className="mx-auto h-12 w-12 opacity-20" />
                <p className="mt-4">Aucune formule trouvée</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedFormuleId} onOpenChange={() => setSelectedFormuleId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail Formule</DialogTitle>
          </DialogHeader>
          {formuleDetail && <FormuleDetailView formule={formuleDetail} />}
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <CreateFormuleDialog open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />

      {/* Edit Dialog */}
      {editFormule && (
        <EditFormuleDialog
          formule={editFormule}
          open={isEditOpen}
          onClose={() => {
            setIsEditOpen(false);
            setEditFormule(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function FormuleCard({
  formule,
  onView,
  onEdit,
}: {
  formule: SanteFormule;
  onView: () => void;
  onEdit: () => void;
}) {
  const deleteFormule = useDeleteFormule();

  return (
    <Card className={!formule.estActif ? 'opacity-60' : ''}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{formule.nom}</CardTitle>
            <p className="text-sm text-muted-foreground font-mono">{formule.code}</p>
          </div>
          <Badge variant={formule.estActif ? 'success' : 'secondary'}>
            {formule.estActif ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground">Tarif mensuel</p>
              <p className="font-medium font-mono">{formatMontant(formule.tarifMensuel)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground">Plafond global</p>
              <p className="font-medium font-mono">
                {formule.plafondGlobal ? formatMontant(formule.plafondGlobal) : 'Illimité'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{formule.nbAdhérents} adhérents</span>
        </div>

        {formule.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{formule.description}</p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={onView}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700"
            onClick={() => {
              if (confirm('Supprimer cette formule ?')) {
                deleteFormule.mutate(formule.id);
              }
            }}
            disabled={formule.nbAdhérents > 0}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FormuleDetailView({ formule }: { formule: FormuleDetail }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Code</p>
          <p className="font-mono font-medium">{formule.code}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Statut</p>
          <Badge variant={formule.estActif ? 'success' : 'secondary'}>
            {formule.estActif ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Tarif mensuel</p>
          <p className="font-mono font-medium">{formatMontant(formule.tarifMensuel)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Plafond global</p>
          <p className="font-mono font-medium">
            {formule.plafondGlobal ? formatMontant(formule.plafondGlobal) : 'Illimité'}
          </p>
        </div>
      </div>

      {formule.description && (
        <div>
          <p className="text-sm text-muted-foreground">Description</p>
          <p className="text-sm">{formule.description}</p>
        </div>
      )}

      {/* Couvertures */}
      <div>
        <h4 className="font-medium mb-3">Couvertures par type de soin</h4>
        <div className="space-y-2">
          {formule.couvertures.map((couv) => (
            <CouvertureRow key={couv.id} couverture={couv} />
          ))}
          {formule.couvertures.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucune couverture definie
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CouvertureRow({ couverture }: { couverture: SanteCouverture }) {
  const typeSoin = TYPE_SOIN_OPTIONS.find((t) => t.value === couverture.typeSoin);

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-3">
        {couverture.estActif ? (
          <CheckCircle className="h-4 w-4 text-green-600" />
        ) : (
          <XCircle className="h-4 w-4 text-gray-400" />
        )}
        <span className="font-medium">{typeSoin?.label || couverture.typeSoin}</span>
      </div>
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-1">
          <Percent className="h-3 w-3 text-muted-foreground" />
          <span>{formatTaux(couverture.tauxCouverture)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Shield className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono">
            {couverture.plafond ? formatMontant(couverture.plafond) : 'Illimité'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span>{formatDelaiCarence(couverture.delaiCarence)}</span>
        </div>
      </div>
    </div>
  );
}

function CreateFormuleDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [tarifMensuel, setTarifMensuel] = useState('');
  const [plafondGlobal, setPlafondGlobal] = useState('');

  const createFormule = useCreateFormule();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await createFormule.mutateAsync({
      code,
      nom,
      description: description || undefined,
      tarifMensuel: Number(tarifMensuel) * 1000, // Convert to millimes
      plafondGlobal: plafondGlobal ? Number(plafondGlobal) * 1000 : undefined,
      couvertures: TYPE_SOIN_OPTIONS.map((t) => ({
        typeSoin: t.value,
        tauxCouverture: 80,
        delaiCarence: 0,
      })),
    });

    // Reset form
    setCode('');
    setNom('');
    setDescription('');
    setTarifMensuel('');
    setPlafondGlobal('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle Formule</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Code</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="FORMULE_01"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nom</label>
              <Input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Formule Standard"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description optionnelle"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tarif mensuel (TND)</label>
              <Input
                type="number"
                step="0.001"
                value={tarifMensuel}
                onChange={(e) => setTarifMensuel(e.target.value)}
                placeholder="50.000"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Plafond global (TND)</label>
              <Input
                type="number"
                step="0.001"
                value={plafondGlobal}
                onChange={(e) => setPlafondGlobal(e.target.value)}
                placeholder="5000.000 (optionnel)"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={createFormule.isPending}>
              {createFormule.isPending ? 'Creation...' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditFormuleDialog({
  formule,
  open,
  onClose,
}: {
  formule: SanteFormule;
  open: boolean;
  onClose: () => void;
}) {
  const [nom, setNom] = useState(formule.nom);
  const [description, setDescription] = useState(formule.description || '');
  const [tarifMensuel, setTarifMensuel] = useState(String(formule.tarifMensuel / 1000));
  const [plafondGlobal, setPlafondGlobal] = useState(
    formule.plafondGlobal ? String(formule.plafondGlobal / 1000) : ''
  );
  const [estActif, setEstActif] = useState(formule.estActif);

  const updateFormule = useUpdateFormule();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await updateFormule.mutateAsync({
      id: formule.id,
      data: {
        nom,
        description: description || undefined,
        tarifMensuel: Number(tarifMensuel) * 1000,
        plafondGlobal: plafondGlobal ? Number(plafondGlobal) * 1000 : null,
        estActif,
      },
    });

    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier Formule</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Code</label>
            <Input value={formule.code} disabled />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Nom</label>
            <Input value={nom} onChange={(e) => setNom(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description optionnelle"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tarif mensuel (TND)</label>
              <Input
                type="number"
                step="0.001"
                value={tarifMensuel}
                onChange={(e) => setTarifMensuel(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Plafond global (TND)</label>
              <Input
                type="number"
                step="0.001"
                value={plafondGlobal}
                onChange={(e) => setPlafondGlobal(e.target.value)}
                placeholder="Optionnel"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={estActif} onCheckedChange={setEstActif} />
            <label className="text-sm">Formule active</label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={updateFormule.isPending}>
              {updateFormule.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

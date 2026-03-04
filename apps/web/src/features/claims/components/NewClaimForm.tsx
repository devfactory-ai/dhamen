import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateClaim } from '../hooks/useClaims';
import { useSearchAdherent } from '@/features/adherents/hooks/useAdherents';
import { useToast } from '@/stores/toast';

interface NewClaimFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

interface ClaimItem {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

const SOIN_TYPES = [
  { value: 'pharmacie', label: 'Pharmacie' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'laboratoire', label: 'Laboratoire' },
  { value: 'hospitalisation', label: 'Hospitalisation' },
  { value: 'dentaire', label: 'Dentaire' },
  { value: 'optique', label: 'Optique' },
  { value: 'kinesitherapie', label: 'Kinésithérapie' },
  { value: 'autre', label: 'Autre' },
];

export function NewClaimForm({ onSuccess, onCancel }: NewClaimFormProps) {
  const [searchNationalId, setSearchNationalId] = useState('');
  const [items, setItems] = useState<ClaimItem[]>([]);
  const [newItem, setNewItem] = useState<Omit<ClaimItem, 'id'>>({ code: '', description: '', quantity: 1, unitPrice: 0 });
  const [typeSoin, setTypeSoin] = useState('pharmacie');
  const { toast } = useToast();

  const { data: adherent, isLoading: isSearching } = useSearchAdherent(searchNationalId);
  const createClaim = useCreateClaim();

  const {
    register,
    handleSubmit,
  } = useForm({
    defaultValues: {
      dateSoin: new Date().toISOString().split('T')[0],
    },
  });

  const addItem = () => {
    if (newItem.code && newItem.description && newItem.unitPrice > 0) {
      setItems([...items, { ...newItem, id: crypto.randomUUID() }]);
      setNewItem({ code: '', description: '', quantity: 1, unitPrice: 0 });
    }
  };

  const removeItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const onSubmit = async (formData: { dateSoin?: string }) => {
    if (!adherent || items.length === 0) { return; }

    const today = new Date().toISOString().split('T')[0] ?? '';
    try {
      await createClaim.mutateAsync({
        adherentId: adherent.id,
        typeSoin,
        montantDemande: totalAmount * 1000, // Convert to millimes
        dateSoin: formData.dateSoin ?? today,
      });
      toast({ title: 'PEC créée avec succès', variant: 'success' });
      onSuccess();
    } catch {
      toast({ title: 'Erreur lors de la création', description: 'Veuillez réessayer', variant: 'destructive' });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Adhérent Search */}
      <div className="space-y-2">
        <Label>Rechercher l'adhérent par CIN</Label>
        <div className="flex gap-2">
          <Input
            placeholder="N° CIN (ex: 12345678)"
            value={searchNationalId}
            onChange={(e) => setSearchNationalId(e.target.value)}
          />
          {isSearching && (
            <div className="flex items-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
        </div>
        {adherent && (
          <Card className="mt-2">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{adherent.firstName} {adherent.lastName}</p>
                  <p className='text-muted-foreground text-sm'>N° {adherent.memberNumber}</p>
                </div>
                <Badge variant={adherent.isActive ? 'success' : 'destructive'}>
                  {adherent.isActive ? 'Éligible' : 'Non éligible'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Type de soin */}
      <div className="space-y-2">
        <Label>Type de soin</Label>
        <Select value={typeSoin} onValueChange={setTypeSoin}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOIN_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Service Date */}
      <div className="space-y-2">
        <Label htmlFor="dateSoin">Date du soin</Label>
        <Input id="dateSoin" type="date" {...register('dateSoin', { required: true })} />
      </div>

      {/* Items */}
      <div className="space-y-4">
        <Label>Produits / Services</Label>

        {/* Add Item Form */}
        <div className="flex gap-2">
          <Input
            placeholder="Code"
            value={newItem.code}
            onChange={(e) => setNewItem({ ...newItem, code: e.target.value })}
            className="w-24"
          />
          <Input
            placeholder="Description"
            value={newItem.description}
            onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
            className="flex-1"
          />
          <Input
            type="number"
            placeholder="Qté"
            value={newItem.quantity}
            onChange={(e) => setNewItem({ ...newItem, quantity: Number.parseInt(e.target.value) || 1 })}
            className="w-20"
          />
          <Input
            type="number"
            placeholder="Prix"
            value={newItem.unitPrice || ''}
            onChange={(e) => setNewItem({ ...newItem, unitPrice: Number.parseFloat(e.target.value) || 0 })}
            className="w-24"
          />
          <Button type="button" onClick={addItem} variant="outline">
            +
          </Button>
        </div>

        {/* Items List */}
        {items.length > 0 && (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Code</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right">Qté</th>
                  <th className="p-2 text-right">Prix</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="p-2">{item.code}</td>
                    <td className="p-2">{item.description}</td>
                    <td className="p-2 text-right">{item.quantity}</td>
                    <td className="p-2 text-right">{item.unitPrice.toFixed(3)} TND</td>
                    <td className="p-2 text-right font-medium">
                      {(item.quantity * item.unitPrice).toFixed(3)} TND
                    </td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-destructive hover:underline"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/50 font-medium">
                  <td colSpan={4} className="p-2 text-right">Total</td>
                  <td className="p-2 text-right">{totalAmount.toFixed(3)} TND</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          type="submit"
          disabled={!adherent || items.length === 0 || createClaim.isPending}
        >
          {createClaim.isPending ? 'Création...' : 'Créer la PEC'}
        </Button>
      </div>
    </form>
  );
}

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCreateClaim } from '../hooks/useClaims';
import { useSearchAdherent } from '@/features/adherents/hooks/useAdherents';

interface NewClaimFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

interface ClaimItem {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export function NewClaimForm({ onSuccess, onCancel }: NewClaimFormProps) {
  const [searchNationalId, setSearchNationalId] = useState('');
  const [items, setItems] = useState<ClaimItem[]>([]);
  const [newItem, setNewItem] = useState<ClaimItem>({ code: '', description: '', quantity: 1, unitPrice: 0 });

  const { data: adherent, isLoading: isSearching } = useSearchAdherent(searchNationalId);
  const createClaim = useCreateClaim();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      serviceDate: new Date().toISOString().split('T')[0],
      diagnosis: '',
      notes: '',
    },
  });

  const addItem = () => {
    if (newItem.code && newItem.description && newItem.unitPrice > 0) {
      setItems([...items, newItem]);
      setNewItem({ code: '', description: '', quantity: 1, unitPrice: 0 });
    }
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const onSubmit = async (formData: { serviceDate: string; diagnosis: string; notes: string }) => {
    if (!adherent || items.length === 0) return;

    try {
      await createClaim.mutateAsync({
        adherentId: adherent.id,
        type: 'PHARMACY', // Default, could be dynamic
        amount: totalAmount * 1000, // Convert to millimes
        serviceDate: formData.serviceDate,
        diagnosis: formData.diagnosis || undefined,
        notes: formData.notes || undefined,
        items,
      });
      onSuccess();
    } catch (error) {
      console.error('Error creating claim:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Adherent Search */}
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
                  <p className="text-sm text-muted-foreground">N° {adherent.memberNumber}</p>
                </div>
                <Badge variant={adherent.isActive ? 'success' : 'destructive'}>
                  {adherent.isActive ? 'Éligible' : 'Non éligible'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Service Date */}
      <div className="space-y-2">
        <Label htmlFor="serviceDate">Date du service</Label>
        <Input id="serviceDate" type="date" {...register('serviceDate', { required: true })} />
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
            onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
            className="w-20"
          />
          <Input
            type="number"
            placeholder="Prix"
            value={newItem.unitPrice || ''}
            onChange={(e) => setNewItem({ ...newItem, unitPrice: parseFloat(e.target.value) || 0 })}
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
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className="border-b last:border-0">
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
                        onClick={() => removeItem(index)}
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
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Diagnosis */}
      <div className="space-y-2">
        <Label htmlFor="diagnosis">Diagnostic (optionnel)</Label>
        <Input id="diagnosis" {...register('diagnosis')} />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optionnel)</Label>
        <Textarea id="notes" {...register('notes')} rows={2} />
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

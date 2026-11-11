'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'SUSPENDED';
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function AdminsManagementPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Temporary password display modal
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; tempPass: string } | null>(null);

  const fetchAdmins = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<AdminUser[]>('/admin/admins');
      setAdmins(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load administrators');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.post<{ admin: AdminUser; temporaryPassword: string }>(
        '/admin/admins',
        {
          email: newEmail.trim(),
          fullName: newName.trim(),
        }
      );

      setShowCreateModal(false);
      setNewEmail('');
      setNewName('');
      setCreatedCredentials({
        email: res.data.admin.email,
        tempPass: res.data.temporaryPassword,
      });
      fetchAdmins();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create administrator');
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (admin: AdminUser) => {
    const ok = window.confirm(
      `Are you sure you want to deactivate administrator "${admin.fullName}" (${admin.email})? They will immediately be logged out.`
    );
    if (!ok) return;

    try {
      await api.patch(`/admin/admins/${admin.id}/deactivate`, {});
      fetchAdmins();
    } catch (err: any) {
      alert(err.message || 'Failed to deactivate administrator');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Administrator Accounts
          </h1>
          <p className="text-sm text-slate-500">
            Manage institutional proctor and supervisor access credentials.
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          ➕ Add Administrator
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 text-rose-700 text-sm rounded-lg border border-rose-200">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Administrator</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Password State</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    Loading administrators...
                  </TableCell>
                </TableRow>
              ) : admins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    No administrators found.
                  </TableCell>
                </TableRow>
              ) : (
                admins.map((adm) => (
                  <TableRow key={adm.id}>
                    <TableCell>
                      <div className="font-semibold text-slate-900">{adm.fullName}</div>
                      <div className="text-xs text-slate-400">{adm.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={adm.status === 'ACTIVE' ? 'default' : 'neutral'}>
                        {adm.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {adm.mustChangePassword ? (
                        <Badge variant="warning" className="text-amber-700 border-amber-300">
                          Temporary (Must Change)
                        </Badge>
                      ) : (
                        <span className="text-slate-500">Standard</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {adm.lastLoginAt ? new Date(adm.lastLoginAt).toLocaleString() : 'Never'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {new Date(adm.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {adm.status === 'ACTIVE' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          onClick={() => handleDeactivate(adm)}
                        >
                          Deactivate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Admin Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-md w-full bg-white shadow-2xl">
            <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg">Add New Administrator</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>✕</Button>
            </CardHeader>
            <form onSubmit={handleCreate}>
              <CardContent className="p-6 space-y-4">
                {createError && (
                  <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded border border-rose-200">
                    {createError}
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Full Name</label>
                  <Input
                    required
                    value={newName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
                    placeholder="e.g. Dr. Alex Morgan"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Email Address</label>
                  <Input
                    required
                    type="email"
                    value={newEmail}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEmail(e.target.value)}
                    placeholder="e.g. alex.morgan@institution.edu"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  A strong temporary password will be securely generated and displayed once. The administrator will be required to update their password upon first login.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating ? 'Creating...' : 'Create Account'}
                  </Button>
                </div>
              </CardContent>
            </form>
          </Card>
        </div>
      )}

      {/* Temporary Password Display Modal */}
      {createdCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-md w-full bg-white shadow-2xl border-emerald-500 border-2">
            <CardHeader className="bg-emerald-50 pb-3 border-b border-emerald-100">
              <CardTitle className="text-lg text-emerald-900">Administrator Created</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-slate-700">
                Administrator account for <strong>{createdCredentials.email}</strong> has been provisioned.
              </p>

              <div className="p-3 bg-slate-900 rounded-lg text-white font-mono text-center select-all">
                {createdCredentials.tempPass}
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs">
                ⚠️ <strong>Important:</strong> Copy this temporary password now. It is hashed with Argon2id and will <strong>not</strong> be shown again.
              </div>

              <div className="flex justify-end">
                <Button onClick={() => setCreatedCredentials(null)}>
                  I have safely recorded the password
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

'use client';

import React from 'react';
import Link from 'next/link';
import type { StudentListItemDto } from '@examguard/shared';
import { Badge } from '../ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';

export interface StudentTableProps {
  students: StudentListItemDto[];
  loading?: boolean;
}

export function StudentTable({ students, loading = false }: StudentTableProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 animate-pulse">
        Loading candidates...
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
        <span className="text-3xl mb-2 block">🎓</span>
        <h3 className="text-base font-semibold text-slate-800">No students found</h3>
        <p className="text-xs text-slate-500 mt-1">Try modifying your search or filter criteria.</p>
      </div>
    );
  }

  const getEnrollmentBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <Badge variant="success">Approved</Badge>;
      case 'PENDING_APPROVAL':
        return <Badge variant="warning">Pending Approval</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">Rejected</Badge>;
      case 'REVOKED':
        return <Badge variant="danger">Revoked</Badge>;
      case 'DRAFT':
        return <Badge variant="default">Draft</Badge>;
      default:
        return <Badge variant="default">Not Started</Badge>;
    }
  };

  const getAccountBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success">Active</Badge>;
      case 'SUSPENDED':
        return <Badge variant="danger">Suspended</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Candidate</TableHead>
          <TableHead>Student ID</TableHead>
          <TableHead>Account Status</TableHead>
          <TableHead>Face Enrollment</TableHead>
          <TableHead>Last Active</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student) => (
          <TableRow key={student.id}>
            <TableCell>
              <div>
                <Link
                  href={`/admin/students/${student.id}`}
                  className="font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                >
                  {student.fullName}
                </Link>
                <div className="text-xs text-slate-500">{student.email}</div>
              </div>
            </TableCell>
            <TableCell>
              <span className="font-mono text-xs font-medium text-slate-700">
                {student.studentId}
              </span>
            </TableCell>
            <TableCell>{getAccountBadge(student.status)}</TableCell>
            <TableCell>{getEnrollmentBadge(student.enrollmentStatus)}</TableCell>
            <TableCell className="text-xs text-slate-500">
              {student.lastLoginAt ? new Date(student.lastLoginAt).toLocaleDateString() : 'Never'}
            </TableCell>
            <TableCell className="text-right">
              <Link
                href={`/admin/students/${student.id}`}
                className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors px-2.5 py-1 rounded-md hover:bg-blue-50"
              >
                Inspect →
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-between p-6 md:p-12">
      <div className="w-full max-w-4xl mx-auto flex flex-col items-center text-center">
        {/* Header Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold uppercase tracking-wider mb-6">
          ExamGuard Core System · Security & Authentication Active
        </div>

        {/* Title & Description */}
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-4">
          Exam<span className="text-blue-600">Guard</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-600 max-w-2xl mb-12">
          Continuous Facial Identity Verification for Secure Online Examinations.
          Ensuring candidate integrity throughout the entire examination lifecycle.
        </p>

        {/* Portal Entry Points */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl text-left mb-12">
          {/* Student Entry */}
          <Card className="flex flex-col justify-between border-slate-200 hover:border-blue-400 hover:shadow-md transition-all">
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold mb-3">
                S
              </div>
              <CardTitle>Student Portal</CardTitle>
              <CardDescription>
                Guided face enrollment, identity verification, and secure exam workstation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/login" className="w-full block">
                <Button variant="primary" className="w-full justify-center">
                  Student Sign In →
                </Button>
              </Link>
              <div className="mt-3 text-center">
                <Link href="/register" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                  New candidate? Register here
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Admin Entry */}
          <Card className="flex flex-col justify-between border-slate-200 hover:border-slate-400 hover:shadow-md transition-all">
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold mb-3">
                A
              </div>
              <CardTitle>Administrator Portal</CardTitle>
              <CardDescription>
                Live exam proctoring, face gallery approval, incident review, and system audits.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/admin/login" className="w-full block">
                <Button variant="secondary" className="w-full justify-center bg-slate-900 text-white hover:bg-slate-800">
                  Administrator Sign In →
                </Button>
              </Link>
              <div className="mt-3 text-center">
                <span className="text-xs text-slate-400">
                  Authorized administrative personnel only
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Real System Diagnostics Entry */}
        <div className="w-full max-w-3xl">
          <Card className="bg-gradient-to-r from-slate-900 to-slate-800 text-white border-0 shadow-md">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-2">
              <div className="text-left">
                <h4 className="text-base font-bold text-white">System Diagnostics & Health</h4>
                <p className="text-sm text-slate-300">
                  Inspect the live status of Web, API, Database, and Python Vision service.
                </p>
              </div>
              <Link href="/system-status" className="w-full sm:w-auto">
                <Button variant="primary" className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white">
                  View System Status →
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>

      <footer className="mt-12 text-xs text-slate-400 text-center">
        ExamGuard © 2026 · Automated detection indicates a possible discrepancy and is not proof of misconduct.
      </footer>
    </main>
  );
}

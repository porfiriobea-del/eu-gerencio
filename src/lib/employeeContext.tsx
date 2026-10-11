import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { Employee, Movement } from '../types';
import { 
  subscribeEmployees, 
  addEmployee, 
  updateEmployee, 
  deleteEmployee, 
  recordMovement, 
  getActiveEmployeeStorage, 
  setActiveEmployeeStorage 
} from './api';

export interface EmployeeAnnouncement {
  title: string;
  message: string;
  type: 'entry' | 'exit';
  timestamp: number;
  employeeName: string;
  role?: string;
}

interface EmployeeContextType {
  currentEmployee: Employee | null;
  employees: Employee[];
  isLoadingEmployees: boolean;
  activeShiftDuration: string;
  activeAnnouncement: EmployeeAnnouncement | null;
  clearAnnouncement: () => void;
  loginEmployee: (employee: Employee) => Promise<void>;
  logoutEmployee: () => Promise<void>;
  createEmployee: (data: Omit<Employee, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  editEmployee: (id: string, data: Partial<Employee>) => Promise<void>;
  removeEmployee: (id: string) => Promise<void>;
  isSwitchModalOpen: boolean;
  openSwitchModal: () => void;
  closeSwitchModal: () => void;
}

const EmployeeContext = createContext<EmployeeContextType | undefined>(undefined);

export const EmployeeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [activeAnnouncement, setActiveAnnouncement] = useState<EmployeeAnnouncement | null>(null);
  const [isSwitchModalOpen, setIsSwitchModalOpen] = useState(false);
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(() => {
    try {
      const stored = getActiveEmployeeStorage();
      if (stored && stored.id && stored.id !== 'owner') {
        return {
          id: stored.id,
          name: stored.name,
          role: stored.role || 'Operador',
          isActive: true,
          ownerId: '',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
      }
    } catch {}
    return null;
  });

  // Calculate real-time shift duration
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTs(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  const activeShiftDuration = useMemo(() => {
    if (!currentEmployee || !currentEmployee.currentShiftStartedAt) return '';
    const diffMs = Math.max(0, nowTs - currentEmployee.currentShiftStartedAt);
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) {
      return `${minutes} min`;
    }
    return `${hours}h ${minutes}m`;
  }, [currentEmployee, nowTs]);

  // Subscribe to real-time employees from Firestore
  useEffect(() => {
    const unsub = subscribeEmployees((list) => {
      setEmployees(list);
      setIsLoadingEmployees(false);

      // Keep current employee in sync if their record updated in database
      if (currentEmployee?.id) {
        const found = list.find(e => e.id === currentEmployee.id);
        if (found) {
          setCurrentEmployee(found);
          setActiveEmployeeStorage({ id: found.id!, name: found.name, role: found.role });
        }
      }
    });

    return () => unsub();
  }, [currentEmployee?.id]);

  // Auto-dismiss announcements after 8 seconds
  useEffect(() => {
    if (!activeAnnouncement) return;
    const timer = setTimeout(() => {
      setActiveAnnouncement(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [activeAnnouncement]);

  const clearAnnouncement = () => setActiveAnnouncement(null);
  const openSwitchModal = () => setIsSwitchModalOpen(true);
  const closeSwitchModal = () => setIsSwitchModalOpen(false);

  // LOG IN / START SHIFT
  const loginEmployee = async (employee: Employee) => {
    const now = Date.now();
    const timeFormatted = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(now);

    const updatedEmployee: Employee = {
      ...employee,
      currentShiftStartedAt: now,
      updatedAt: now
    };

    setCurrentEmployee(updatedEmployee);
    setActiveEmployeeStorage({ id: employee.id!, name: employee.name, role: employee.role });

    // Update in Firestore
    if (employee.id) {
      updateEmployee(employee.id, {
        currentShiftStartedAt: now
      }).catch(e => console.warn('Could not update employee shift start in Firestore:', e));
    }

    // Record movement in history
    recordMovement({
      timestamp: now,
      employeeId: employee.id || 'employee',
      employeeName: employee.name,
      employeeRole: employee.role,
      type: 'employee_login',
      description: `ENTRADA DE FUNCIONÁRIO: ${employee.name} (${employee.role}) iniciou o turno de trabalho às ${timeFormatted}. Todas as próximas movimentações serão atribuídas a ele.`,
      entityId: employee.id,
      entityName: employee.name
    }).catch(e => console.warn('Could not record employee login movement:', e));

    // Show announcement banner
    setActiveAnnouncement({
      title: 'Funcionário em Serviço!',
      message: `${employee.name} (${employee.role}) iniciou o turno às ${timeFormatted}.`,
      type: 'entry',
      timestamp: now,
      employeeName: employee.name,
      role: employee.role
    });

    setIsSwitchModalOpen(false);
  };

  // LOG OUT / END SHIFT
  const logoutEmployee = async () => {
    if (!currentEmployee) return;

    const now = Date.now();
    const timeFormatted = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(now);

    let durationText = '';
    if (currentEmployee.currentShiftStartedAt) {
      const diffMs = Math.max(0, now - currentEmployee.currentShiftStartedAt);
      const totalMinutes = Math.floor(diffMs / (1000 * 60));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
    }

    const previousEmp = currentEmployee;

    // Update in Firestore
    if (previousEmp.id) {
      updateEmployee(previousEmp.id, {
        currentShiftStartedAt: undefined,
        lastShiftEndedAt: now
      }).catch(e => console.warn('Could not update employee shift end in Firestore:', e));
    }

    // Reset current employee
    setCurrentEmployee(null);
    setActiveEmployeeStorage(null);

    // Record movement in history
    const durationDetail = durationText ? ` (Duração do turno: ${durationText})` : '';
    recordMovement({
      timestamp: now,
      employeeId: previousEmp.id || 'employee',
      employeeName: previousEmp.name,
      employeeRole: previousEmp.role,
      type: 'employee_logout',
      description: `SAÍDA DE FUNCIONÁRIO: ${previousEmp.name} (${previousEmp.role}) encerrou o turno e saiu às ${timeFormatted}${durationDetail}.`,
      entityId: previousEmp.id,
      entityName: previousEmp.name
    }).catch(e => console.warn('Could not record employee logout movement:', e));

    // Show announcement banner
    setActiveAnnouncement({
      title: 'Saída Registrada!',
      message: `${previousEmp.name} encerrou o turno às ${timeFormatted}${durationDetail}.`,
      type: 'exit',
      timestamp: now,
      employeeName: previousEmp.name,
      role: previousEmp.role
    });

    setIsSwitchModalOpen(false);
  };

  const createEmployee = async (data: Omit<Employee, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>) => {
    const id = await addEmployee(data);
    return id;
  };

  const editEmployee = async (id: string, data: Partial<Employee>) => {
    await updateEmployee(id, data);
  };

  const removeEmployee = async (id: string) => {
    const emp = employees.find(e => e.id === id);
    if (currentEmployee?.id === id) {
      await logoutEmployee();
    }
    await deleteEmployee(id, emp?.name);
  };

  return (
    <EmployeeContext.Provider
      value={{
        currentEmployee,
        employees,
        isLoadingEmployees,
        activeShiftDuration,
        activeAnnouncement,
        clearAnnouncement,
        loginEmployee,
        logoutEmployee,
        createEmployee,
        editEmployee,
        removeEmployee,
        isSwitchModalOpen,
        openSwitchModal,
        closeSwitchModal
      }}
    >
      {children}
    </EmployeeContext.Provider>
  );
};

export const useEmployee = (): EmployeeContextType => {
  const context = useContext(EmployeeContext);
  if (!context) {
    throw new Error('useEmployee must be used within an EmployeeProvider');
  }
  return context;
};

import React, { useState } from 'react';
import { Space, Dropdown, Modal, Form, Select, Input, DatePicker, message } from 'antd';
import {
  DownloadOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  MailOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { ExportFormat } from '../../types';
import { useAppSelector } from '@/store';
import { selectTheme } from '@/store/slices/uiSlice';

interface ExportToolbarProps {
  onExport: (format: ExportFormat, options?: ExportOptions) => Promise<void>;
  onSchedule?: () => void;
  onEmail?: (recipients: string[], format: ExportFormat) => void;
  loading?: boolean;
  canSchedule?: boolean;
}

interface ExportOptions {
  includeHeaders?: boolean;
  dateRange?: [Date, Date];
  recipients?: string[];
}

export const ExportToolbar: React.FC<ExportToolbarProps> = ({
  onExport,
  onSchedule,
  onEmail,
  loading = false,
  canSchedule = false,
}) => {
  const theme = useAppSelector(selectTheme);
  const darkMode = theme.darkMode;
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('excel');
  const [exportForm] = Form.useForm();
  const [emailForm] = Form.useForm();

  const handleQuickExport = async (format: ExportFormat) => {
    try {
      await onExport(format);
      message.success(`Report exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Export failed:', error);
      message.error('Failed to export report');
    }
  };

  const handleAdvancedExport = async () => {
    try {
      const values = await exportForm.validateFields();
      await onExport(selectedFormat, {
        includeHeaders: values.includeHeaders,
        dateRange: values.dateRange ? [values.dateRange[0].toDate(), values.dateRange[1].toDate()] : undefined,
      });
      message.success(`Report exported as ${selectedFormat.toUpperCase()}`);
      setExportModalOpen(false);
      exportForm.resetFields();
    } catch (error) {
      console.error('Advanced export failed:', error);
      message.error('Failed to export report');
    }
  };

  const handleEmailExport = async () => {
    try {
      const values = await emailForm.validateFields();
      const recipients = values.recipients.split(',').map((email: string) => email.trim());
      
      if (onEmail) {
        onEmail(recipients, values.format);
        message.success('Report sent via email');
        setEmailModalOpen(false);
        emailForm.resetFields();
      }
    } catch (error) {
      console.error('Email export failed:', error);
      message.error('Failed to send report');
    }
  };

  const exportMenuItems: MenuProps['items'] = [
    {
      key: 'excel',
      label: 'Quick Export as Excel',
      icon: <FileExcelOutlined />,
      onClick: () => handleQuickExport('excel'),
    },
    {
      key: 'csv',
      label: 'Quick Export as CSV',
      icon: <FileTextOutlined />,
      onClick: () => handleQuickExport('csv'),
    },
    {
      key: 'pdf',
      label: 'Quick Export as PDF',
      icon: <FilePdfOutlined />,
      onClick: () => handleQuickExport('pdf'),
    },
    {
      type: 'divider',
    },
    {
      key: 'advanced',
      label: 'Advanced Export...',
      icon: <DownloadOutlined />,
      onClick: () => setExportModalOpen(true),
    },
  ];

  if (onEmail) {
    exportMenuItems.push({
      key: 'email',
      label: 'Send via Email...',
      icon: <MailOutlined />,
      onClick: () => setEmailModalOpen(true),
    });
  }

  if (canSchedule && onSchedule) {
    exportMenuItems.push({
      type: 'divider',
    });
    exportMenuItems.push({
      key: 'schedule',
      label: 'Schedule Export...',
      icon: <ScheduleOutlined />,
      onClick: onSchedule,
    });
  }

  return (
    <>
      <Space>
        <Dropdown 
          menu={{ items: exportMenuItems }} 
          placement="bottomRight"
          overlayStyle={{
            minWidth: '200px',
          }}
        >
          <button 
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 text-white font-medium hover:shadow-xl hover:scale-105 transition-all duration-200 shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            <DownloadOutlined />
            Export Options
          </button>
        </Dropdown>
      </Space>

      <Modal
        title="Advanced Export Options"
        open={exportModalOpen}
        onOk={handleAdvancedExport}
        onCancel={() => {
          setExportModalOpen(false);
          exportForm.resetFields();
        }}
        confirmLoading={loading}
        className={darkMode ? 'dark-modal' : ''}
        okButtonProps={{
          className: 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 border-0',
        }}
      >
        <Form form={exportForm} layout="vertical" initialValues={{ includeHeaders: true, format: 'excel' }}>
          <Form.Item name="format" label="Export Format" rules={[{ required: true }]}>
            <Select onChange={setSelectedFormat}>
              <Select.Option value="excel">
                <FileExcelOutlined /> Excel (.xlsx)
              </Select.Option>
              <Select.Option value="csv">
                <FileTextOutlined /> CSV (.csv)
              </Select.Option>
              <Select.Option value="pdf">
                <FilePdfOutlined /> PDF (.pdf)
              </Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="includeHeaders" valuePropName="checked">
            <Select>
              <Select.Option value={true}>Include Column Headers</Select.Option>
              <Select.Option value={false}>Data Only (No Headers)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="dateRange" label="Filter by Date Range (Optional)">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Send Report via Email"
        open={emailModalOpen}
        onOk={handleEmailExport}
        onCancel={() => {
          setEmailModalOpen(false);
          emailForm.resetFields();
        }}
        confirmLoading={loading}
        className={darkMode ? 'dark-modal' : ''}
        okButtonProps={{
          className: 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 border-0',
        }}
      >
        <Form form={emailForm} layout="vertical" initialValues={{ format: 'excel' }}>
          <Form.Item
            name="recipients"
            label="Recipients (comma-separated)"
            rules={[
              { required: true, message: 'Please enter at least one email address' },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  const emails = value.split(',').map((e: string) => e.trim());
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  const invalidEmails = emails.filter((email: string) => !emailRegex.test(email));
                  
                  if (invalidEmails.length > 0) {
                    return Promise.reject(`Invalid email(s): ${invalidEmails.join(', ')}`);
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input.TextArea
              placeholder="john@example.com, jane@example.com"
              rows={3}
            />
          </Form.Item>

          <Form.Item name="format" label="File Format" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="excel">
                <FileExcelOutlined /> Excel (.xlsx)
              </Select.Option>
              <Select.Option value="csv">
                <FileTextOutlined /> CSV (.csv)
              </Select.Option>
              <Select.Option value="pdf">
                <FilePdfOutlined /> PDF (.pdf)
              </Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
      
      <style>{`
        .dark-modal .ant-modal-content {
          background: rgba(17, 24, 39, 0.95);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(75, 85, 99, 0.3);
        }
        
        .dark-modal .ant-modal-header {
          background: transparent;
          border-bottom: 1px solid rgba(75, 85, 99, 0.3);
        }
        
        .dark-modal .ant-modal-title {
          color: #fff;
        }
        
        .dark-modal .ant-modal-close {
          color: rgba(156, 163, 175, 1);
        }
        
        .dark-modal .ant-modal-close:hover {
          color: #fff;
        }
        
        .ant-dropdown-menu {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(147, 51, 234, 0.2);
          border-radius: 12px;
          padding: 4px;
        }
        
        .ant-dropdown-menu-dark {
          background: rgba(17, 24, 39, 0.95);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(75, 85, 99, 0.3);
        }
        
        .ant-dropdown-menu-item {
          border-radius: 8px;
          transition: all 0.2s;
        }
        
        .ant-dropdown-menu-item:hover {
          background: linear-gradient(to right, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1));
        }
      `}</style>
    </>
  );
};